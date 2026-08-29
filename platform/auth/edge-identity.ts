import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import type { RuntimeEnv } from "../runtime/environment";

const ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion";
const INTERNAL_IDENTITY_HEADERS = [
  "oai-authenticated-user-id",
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "oai-authenticated-user-full-name-encoding",
] as const;
const UNTRUSTED_ACCESS_HEADERS = [
  ACCESS_ASSERTION_HEADER,
  "cf-access-authenticated-user-email",
] as const;
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

export interface CloudflareAccessConfig {
  teamDomain: string;
  audience: string;
}

export interface EdgeIdentityOptions {
  accessKeySet?: JWTVerifyGetKey;
}

export async function normalizeRequestIdentity(
  request: Request,
  env: Pick<
    RuntimeEnv,
    | "AUTH_PROVIDER"
    | "CLOUDFLARE_ACCESS_TEAM_DOMAIN"
    | "CLOUDFLARE_ACCESS_AUD"
  >,
  options: EdgeIdentityOptions = {},
): Promise<Request> {
  const incoming = request.headers;
  const sitesIdentity = readSitesIdentity(incoming);
  const accessAssertion = incoming.get(ACCESS_ASSERTION_HEADER);
  const headers = new Headers(incoming);
  for (const name of INTERNAL_IDENTITY_HEADERS) headers.delete(name);
  for (const name of UNTRUSTED_ACCESS_HEADERS) headers.delete(name);

  if (env.AUTH_PROVIDER === "chatgpt-sites" && sitesIdentity) {
    writeSitesIdentity(headers, sitesIdentity);
  } else if (env.AUTH_PROVIDER === "cloudflare-access" && accessAssertion) {
    try {
      const identity = await verifyCloudflareAccessToken(
        accessAssertion,
        {
          teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? "",
          audience: env.CLOUDFLARE_ACCESS_AUD ?? "",
        },
        options.accessKeySet,
      );
      headers.set(
        "oai-authenticated-user-id",
        `cloudflare-access:${identity.subject}`,
      );
      headers.set("oai-authenticated-user-email", identity.email);
    } catch {
      // Invalid or unavailable edge identity remains anonymous. Owner routes
      // fail closed through the existing private authentication response.
    }
  }

  return new Request(request, { headers });
}

export async function verifyCloudflareAccessToken(
  assertion: string,
  config: CloudflareAccessConfig,
  keySet?: JWTVerifyGetKey,
): Promise<{ subject: string; email: string }> {
  try {
    const teamDomain = validTeamDomain(config.teamDomain);
    const audience = validAudience(config.audience);
    if (!assertion || assertion.length > 16_384) throw new Error("invalid");
    const keys = keySet ?? remoteKeySetFor(teamDomain);
    const { payload } = await jwtVerify(assertion, keys, {
      algorithms: ["RS256"],
      issuer: `https://${teamDomain}`,
      audience,
      clockTolerance: 5,
    });
    return claimsIdentity(payload);
  } catch {
    throw new Error("Cloudflare Access identity is invalid");
  }
}

function remoteKeySetFor(teamDomain: string): JWTVerifyGetKey {
  const existing = remoteKeySets.get(teamDomain);
  if (existing) return existing;
  const keySet = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60 * 1_000,
    },
  );
  remoteKeySets.set(teamDomain, keySet);
  return keySet;
}

function claimsIdentity(payload: JWTPayload): {
  subject: string;
  email: string;
} {
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string"
    ? payload.email.trim().toLocaleLowerCase("en-US")
    : "";
  if (
    !subject ||
    subject.length > 512 ||
    !validEmail(email)
  ) {
    throw new Error("invalid");
  }
  return { subject, email };
}

function validTeamDomain(value: string): string {
  const domain = value.trim().toLocaleLowerCase("en-US");
  if (
    domain.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(domain)
  ) {
    throw new Error("invalid");
  }
  return domain;
}

function validAudience(value: string): string {
  const audience = value.trim();
  if (!audience || audience.length > 2_048 || /\s/.test(audience)) {
    throw new Error("invalid");
  }
  return audience;
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readSitesIdentity(headers: Headers) {
  const userId = headers.get("oai-authenticated-user-id")?.trim() ?? "";
  const email = headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLocaleLowerCase("en-US") ?? "";
  if (!userId || userId.length > 512 || !validEmail(email)) return null;

  const fullName = headers.get("oai-authenticated-user-full-name");
  const fullNameEncoding = headers.get(
    "oai-authenticated-user-full-name-encoding",
  );
  return {
    userId,
    email,
    fullName:
      fullName && fullName.length <= 2_048 &&
      fullNameEncoding === "percent-encoded-utf-8"
        ? fullName
        : null,
  };
}

function writeSitesIdentity(
  headers: Headers,
  identity: { userId: string; email: string; fullName: string | null },
) {
  headers.set("oai-authenticated-user-id", identity.userId);
  headers.set("oai-authenticated-user-email", identity.email);
  if (identity.fullName) {
    headers.set("oai-authenticated-user-full-name", identity.fullName);
    headers.set(
      "oai-authenticated-user-full-name-encoding",
      "percent-encoded-utf-8",
    );
  }
}
