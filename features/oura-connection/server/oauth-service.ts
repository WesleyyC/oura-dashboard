import { eq, lte } from "drizzle-orm";

import { getDb, ouraOAuthStates } from "@/platform/database/server";
import { getRuntimeEnv } from "@/platform/runtime/server";
import { abortable } from "@/shared/abortable";
import { hashOAuthState } from "./token-crypto.ts";
import type { OuraTokenSet } from "./token-contracts.ts";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const CALLBACK_PATHS = {
  owner: "/api/oura/callback",
  guest: "/api/oura/guest/callback",
} as const;
const REQUIRED_SCOPES = ["daily", "workout"] as const;
const STATE_LIFETIME_MS = 10 * 60 * 1_000;
const TOKEN_EXPIRY_SAFETY_SECONDS = 60;

export type SafeOuraErrorCode =
  | "configuration_missing"
  | "invalid_callback_origin"
  | "invalid_oauth_state"
  | "invalid_request"
  | "oauth_client_rejected"
  | "oauth_grant_rejected"
  | "oauth_request_rejected"
  | "oauth_scope_rejected"
  | "profile_not_found"
  | "token_access_invalid"
  | "token_endpoint_rate_limited"
  | "token_endpoint_unavailable"
  | "token_expiry_invalid"
  | "token_exchange_failed"
  | "token_payload_unreadable"
  | "token_refresh_invalid"
  | "token_response_invalid";

const SAFE_ERROR_MESSAGES: Record<SafeOuraErrorCode, string> = {
  configuration_missing: "Oura application setup is incomplete",
  invalid_callback_origin: "Oura callback origin is invalid",
  invalid_oauth_state: "Oura authorization state is invalid or expired",
  invalid_request: "Oura authorization request is invalid",
  oauth_client_rejected: "Oura rejected the application credentials",
  oauth_grant_rejected: "Oura rejected the authorization grant",
  oauth_request_rejected: "Oura rejected the token request",
  oauth_scope_rejected: "Oura rejected the requested permissions",
  profile_not_found: "Oura profile was not found",
  token_access_invalid: "Oura returned an invalid access token",
  token_endpoint_rate_limited: "Oura is temporarily limiting authorization requests",
  token_endpoint_unavailable: "The Oura token endpoint is unavailable",
  token_expiry_invalid: "Oura returned an invalid token expiry",
  token_exchange_failed: "Oura authorization could not be completed",
  token_payload_unreadable: "Oura returned an unreadable token response",
  token_refresh_invalid: "Oura returned an invalid refresh token",
  token_response_invalid: "Oura returned an invalid authorization response",
};

export class SafeOuraError extends Error {
  readonly code: SafeOuraErrorCode;

  constructor(code: SafeOuraErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "SafeOuraError";
    this.code = code;
  }
}

export interface OuraOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: readonly string[];
}

export type OAuthFlow = "owner" | "guest";

export interface OAuthStateRecord {
  stateHash: string;
  ownerId: string;
  profileId: string;
  flow: OAuthFlow;
  expiresAt: string;
  createdAt: string;
}

export interface OAuthStateRepository {
  deleteExpired(cutoff: string): Promise<void>;
  createState(record: OAuthStateRecord): Promise<void>;
  takeState(stateHash: string): Promise<OAuthStateRecord | null>;
}

export interface OAuthStateOptions {
  repository?: OAuthStateRepository;
}

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function callbackUriFor(request: Request, flow: OAuthFlow): string {
  validateFlow(flow);
  const url = new URL(request.url);
  if (
    (url.protocol !== "https:" && url.hostname !== "localhost") ||
    url.username ||
    url.password
  ) {
    throw new SafeOuraError("invalid_callback_origin");
  }
  return `${url.origin}${CALLBACK_PATHS[flow]}`;
}

export function oauthConfigFor(
  request: Request,
  flow: OAuthFlow,
): OuraOAuthConfig {
  const env = getRuntimeEnv();
  const clientId = env.OURA_CLIENT_ID;
  const clientSecret = env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SafeOuraError("configuration_missing");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: callbackUriFor(request, flow),
    scopes: REQUIRED_SCOPES,
  };
}

export function buildAuthorizationUrl(
  config: OuraOAuthConfig,
  state: string,
): string {
  validateConfig(config);
  if (!state || state.length > 2_048) {
    throw new SafeOuraError("invalid_request");
  }
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export function exchangeAuthorizationCode(
  config: OuraOAuthConfig,
  code: string,
  fetchImpl: FetchImplementation = fetch,
  now = new Date(),
): Promise<OuraTokenSet> {
  if (!code || code.length > 4_096) {
    return Promise.reject(new SafeOuraError("invalid_request"));
  }
  return postTokenForm(
    config,
    {
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    },
    fetchImpl,
    now,
  );
}

export function refreshOAuthTokens(
  config: OuraOAuthConfig,
  refreshToken: string,
  fetchImpl: FetchImplementation = fetch,
  now = new Date(),
  signal?: AbortSignal,
): Promise<OuraTokenSet> {
  if (!refreshToken || refreshToken.length > 8_192) {
    return Promise.reject(new SafeOuraError("invalid_request"));
  }
  return postTokenForm(
    config,
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    },
    fetchImpl,
    now,
    signal,
  );
}

export async function issueOAuthState(
  ownerId: string,
  profileId: string,
  flow: OAuthFlow,
  now = new Date(),
  options: OAuthStateOptions = {},
): Promise<string> {
  validateIdentity(ownerId, profileId);
  validateFlow(flow);
  const createdAt = validTimestamp(now);
  const rawState = randomState();
  const stateHash = await hashOAuthState(rawState);
  const expiresAt = new Date(now.getTime() + STATE_LIFETIME_MS).toISOString();
  const repository = options.repository ?? dbOAuthStateRepository();
  await repository.deleteExpired(createdAt);
  await repository.createState({
    stateHash,
    ownerId,
    profileId,
    flow,
    expiresAt,
    createdAt,
  });
  return rawState;
}

export async function consumeOAuthState(
  rawState: string,
  now = new Date(),
  options: OAuthStateOptions = {},
): Promise<{ ownerId: string; profileId: string; flow: OAuthFlow }> {
  validTimestamp(now);
  let stateHash: string;
  try {
    stateHash = await hashOAuthState(rawState);
  } catch {
    throw new SafeOuraError("invalid_oauth_state");
  }
  const repository = options.repository ?? dbOAuthStateRepository();
  const record = await repository.takeState(stateHash);
  if (!record || Date.parse(record.expiresAt) <= now.getTime()) {
    throw new SafeOuraError("invalid_oauth_state");
  }
  validateFlow(record.flow);
  return {
    ownerId: record.ownerId,
    profileId: record.profileId,
    flow: record.flow,
  };
}

async function postTokenForm(
  config: OuraOAuthConfig,
  form: Record<string, string>,
  fetchImpl: FetchImplementation,
  now: Date,
  signal?: AbortSignal,
): Promise<OuraTokenSet> {
  validateConfig(config);
  validTimestamp(now);
  let response: Response;
  try {
    signal?.throwIfAborted();
    const requestSignal = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]);
    response = await abortable(fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      redirect: "manual",
      cache: "no-store",
      signal: requestSignal,
    }), requestSignal);
  } catch {
    throw new SafeOuraError("token_endpoint_unavailable");
  }
  if (!response.ok) {
    throw new SafeOuraError(await tokenEndpointErrorCode(response));
  }

  let payload: unknown;
  try {
    payload = await abortable(response.json(), signal);
  } catch {
    throw new SafeOuraError("token_payload_unreadable");
  }
  return parseTokenResponse(payload, config.scopes, now);
}

async function tokenEndpointErrorCode(
  response: Response,
): Promise<SafeOuraErrorCode> {
  // Transport status takes precedence over an untrusted OAuth error body.
  if (response.status === 429) return "token_endpoint_rate_limited";
  if (response.status >= 500) return "token_endpoint_unavailable";
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return "token_exchange_failed";
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "token_exchange_failed";
  }
  switch ((payload as Record<string, unknown>).error) {
    case "invalid_request":
      return "oauth_request_rejected";
    case "invalid_client":
      return "oauth_client_rejected";
    case "invalid_grant":
      return "oauth_grant_rejected";
    case "invalid_scope":
      return "oauth_scope_rejected";
    default:
      return "token_exchange_failed";
  }
}

function parseTokenResponse(
  payload: unknown,
  requestedScopes: readonly string[],
  now: Date,
): OuraTokenSet {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SafeOuraError("token_payload_unreadable");
  }
  const value = payload as Record<string, unknown>;
  if (typeof value.access_token !== "string" || !value.access_token) {
    throw new SafeOuraError("token_access_invalid");
  }
  if (typeof value.refresh_token !== "string" || !value.refresh_token) {
    throw new SafeOuraError("token_refresh_invalid");
  }
  if (
    typeof value.expires_in !== "number" ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0
  ) {
    throw new SafeOuraError("token_expiry_invalid");
  }
  const grantedScopes = [...requestedScopes];
  const expiresAt = new Date(
    now.getTime() +
      (value.expires_in - TOKEN_EXPIRY_SAFETY_SECONDS) * 1_000,
  ).toISOString();
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt,
    grantedScopes,
  };
}

function validateConfig(config: OuraOAuthConfig): void {
  if (!config.clientId || !config.clientSecret) {
    throw new SafeOuraError("configuration_missing");
  }
  let redirect: URL;
  try {
    redirect = new URL(config.redirectUri);
  } catch {
    throw new SafeOuraError("invalid_callback_origin");
  }
  if (
    !Object.values(CALLBACK_PATHS).includes(
      redirect.pathname as (typeof CALLBACK_PATHS)[OAuthFlow],
    ) ||
    redirect.search ||
    redirect.hash ||
    (redirect.protocol !== "https:" && redirect.hostname !== "localhost") ||
    config.scopes.length !== REQUIRED_SCOPES.length ||
    !REQUIRED_SCOPES.every((scope) => config.scopes.includes(scope))
  ) {
    throw new SafeOuraError("invalid_callback_origin");
  }
}

function dbOAuthStateRepository(): OAuthStateRepository {
  const db = getDb();
  return {
    async deleteExpired(cutoff) {
      await db
        .delete(ouraOAuthStates)
        .where(lte(ouraOAuthStates.expiresAt, cutoff));
    },
    async createState(record) {
      await db.insert(ouraOAuthStates).values(record);
    },
    async takeState(stateHash) {
      const rows = await db
        .delete(ouraOAuthStates)
        .where(eq(ouraOAuthStates.stateHash, stateHash))
        .returning({
          stateHash: ouraOAuthStates.stateHash,
          ownerId: ouraOAuthStates.ownerId,
          profileId: ouraOAuthStates.profileId,
          flow: ouraOAuthStates.flow,
          expiresAt: ouraOAuthStates.expiresAt,
          createdAt: ouraOAuthStates.createdAt,
        });
      return rows[0] ?? null;
    },
  };
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function validateIdentity(ownerId: string, profileId: string): void {
  if (!ownerId || !profileId) {
    throw new SafeOuraError("invalid_request");
  }
}

function validateFlow(flow: string): asserts flow is OAuthFlow {
  if (flow !== "owner" && flow !== "guest") {
    throw new SafeOuraError("invalid_request");
  }
}

function validTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new SafeOuraError("invalid_request");
  }
  return now.toISOString();
}
