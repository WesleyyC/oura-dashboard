import { lte, sql } from "drizzle-orm";

import { parseChatGPTUser } from "../auth/server";
import { getDb, securityRateLimits } from "../database/server";
import { getRuntimeEnv } from "../runtime/server";

const HMAC_ALGORITHM = "HMAC";
const KEY_BYTES = 32;
const CLEANUP_GRACE_MS = 60 * 60_000;
const encoder = new TextEncoder();

const POLICIES = {
  owner_profile_mutation: { limit: 30, windowMs: 60_000, actor: "owner" },
  owner_oauth_start: { limit: 20, windowMs: 60_000, actor: "owner" },
  owner_refresh: { limit: 16, windowMs: 15 * 60_000, actor: "owner" },
  guest_invite_inspect: { limit: 30, windowMs: 60_000, actor: "guest" },
  guest_invite_authorize: { limit: 10, windowMs: 60_000, actor: "guest" },
} as const;

const REQUEST_SCOPES = new Map<string, RateLimitScope>([
  ["POST /api/profiles", "owner_profile_mutation"],
  ["PATCH /api/profiles", "owner_profile_mutation"],
  ["DELETE /api/profiles", "owner_profile_mutation"],
  ["DELETE /api/account", "owner_profile_mutation"],
  ["POST /api/oura/authorize", "owner_oauth_start"],
  ["POST /api/oura/invites", "owner_oauth_start"],
  ["DELETE /api/oura/invites", "owner_oauth_start"],
  ["POST /api/oura/refresh", "owner_refresh"],
  ["POST /api/oura/guest/inspect", "guest_invite_inspect"],
  ["POST /api/oura/guest/authorize", "guest_invite_authorize"],
]);

export type RateLimitScope = keyof typeof POLICIES;

export interface RateLimitBucketInput {
  scope: RateLimitScope;
  actorDigest: string;
  windowStartedAt: string;
  expiresAt: string;
}

export interface RateLimitRepository {
  deleteExpired(cutoff: string): Promise<void>;
  consume(input: RateLimitBucketInput): Promise<number>;
}

export interface RateLimitOptions {
  repository?: RateLimitRepository;
  keyText?: string;
  now?: Date;
}

export function rateLimitScopeForRequest(
  request: Request,
): RateLimitScope | null {
  const pathname = new URL(request.url).pathname;
  return REQUEST_SCOPES.get(`${request.method.toUpperCase()} ${pathname}`) ?? null;
}

export async function enforceRequestRateLimit(
  request: Request,
  options: RateLimitOptions = {},
): Promise<Response | null> {
  const scope = rateLimitScopeForRequest(request);
  if (!scope) return null;

  const policy = POLICIES[scope];
  const actor = policy.actor === "owner"
    ? ownerActor(request)
    : guestActor(request);
  if (!actor) return null;

  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("Rate limit timestamp is invalid");
  }
  const keyText = options.keyText ?? getRuntimeEnv().SECURITY_RATE_LIMIT_KEY ?? "";
  const actorDigest = await digestActor(actor, scope, keyText, now);
  const windowStartedAtMs = Math.floor(now.getTime() / policy.windowMs) * policy.windowMs;
  const windowEndsAtMs = windowStartedAtMs + policy.windowMs;
  const repository = options.repository ?? dbRateLimitRepository();

  try {
    await repository.deleteExpired(now.toISOString());
  } catch {
    // Cleanup is best effort. The authoritative atomic consumption still runs.
  }

  const requestCount = await repository.consume({
    scope,
    actorDigest,
    windowStartedAt: new Date(windowStartedAtMs).toISOString(),
    expiresAt: new Date(windowEndsAtMs + CLEANUP_GRACE_MS).toISOString(),
  });
  if (requestCount <= policy.limit) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEndsAtMs - now.getTime()) / 1_000),
  );
  return Response.json({ error: "rate_limited" }, {
    status: 429,
    headers: {
      "Cache-Control": policy.actor === "owner" ? "private, no-store" : "no-store",
      "Retry-After": String(retryAfterSeconds),
    },
  });
}

export function rateLimitServiceUnavailable(): Response {
  return Response.json({ error: "temporarily_unavailable" }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

function ownerActor(request: Request): string | null {
  const userId = parseChatGPTUser(request.headers)?.userId;
  if (!userId) return null;
  if (userId.length > 255 || userId.trim() !== userId) {
    throw new Error("Rate limit actor is invalid");
  }
  return userId;
}

function guestActor(request: Request): string {
  const value = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  return value && value.length <= 64 ? value : "anonymous";
}

async function digestActor(
  actor: string,
  scope: RateLimitScope,
  keyText: string,
  now: Date,
): Promise<string> {
  const key = await importHmacKey(keyText);
  const day = now.toISOString().slice(0, 10);
  const digest = await crypto.subtle.sign(
    HMAC_ALGORITHM,
    key,
    encoder.encode(`health-rhythm-rate-limit:v1:${day}:${scope}:${actor}`),
  );
  return toBase64Url(new Uint8Array(digest));
}

async function importHmacKey(keyText: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = fromBase64Url(keyText);
  } catch {
    throw new Error("Rate limit configuration is invalid");
  }
  if (keyBytes.byteLength !== KEY_BYTES) {
    throw new Error("Rate limit configuration is invalid");
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: HMAC_ALGORITHM, hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function dbRateLimitRepository(): RateLimitRepository {
  const db = getDb();
  return {
    async deleteExpired(cutoff) {
      await db
        .delete(securityRateLimits)
        .where(lte(securityRateLimits.expiresAt, cutoff));
    },
    async consume(input) {
      const rows = await db
        .insert(securityRateLimits)
        .values({ ...input, requestCount: 1 })
        .onConflictDoUpdate({
          target: [securityRateLimits.scope, securityRateLimits.actorDigest],
          set: {
            windowStartedAt: sql`excluded.window_started_at`,
            requestCount: sql`CASE
              WHEN ${securityRateLimits.windowStartedAt} <> excluded.window_started_at
              THEN 1
              ELSE ${securityRateLimits.requestCount} + 1
            END`,
            expiresAt: sql`excluded.expires_at`,
          },
        })
        .returning({ requestCount: securityRateLimits.requestCount });
      const requestCount = rows[0]?.requestCount;
      if (!Number.isInteger(requestCount) || requestCount < 1) {
        throw new Error("Rate limit consumption failed");
      }
      return requestCount;
    },
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value");
  }
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - standard.length % 4) % 4);
  const binary = atob(`${standard}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
