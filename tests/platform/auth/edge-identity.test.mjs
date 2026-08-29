import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";

import {
  normalizeRequestIdentity,
  verifyCloudflareAccessToken,
} from "../../../platform/auth/edge-identity.ts";

const ISSUER = "https://sample-team.cloudflareaccess.com";
const AUDIENCE = "REPLACE_WITH_ACCESS_APPLICATION_AUD";

async function signingFixture() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "sample-key";
  const keySet = createLocalJWKSet({ keys: [publicJwk] });
  return {
    keySet,
    async token(claims = {}, options = {}) {
      const now = Math.floor(Date.now() / 1_000);
      return new SignJWT({
        sub: "access-user-123",
        email: "owner@example.com",
        ...claims,
      })
        .setProtectedHeader({ alg: "RS256", kid: "sample-key" })
        .setIssuer(options.issuer ?? ISSUER)
        .setAudience(options.audience ?? AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(options.expiration ?? now + 300)
        .sign(privateKey);
    },
  };
}

test("Sites mode accepts only its trusted identity contract", async () => {
  const request = new Request("https://dashboard.example.com/api/account", {
    headers: {
      "oai-authenticated-user-id": "sites-user-123",
      "oai-authenticated-user-email": "owner@example.com",
      "oai-authenticated-user-full-name": "Example%20Owner",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      "Cf-Access-Jwt-Assertion": "forged-access-assertion",
      "Cf-Access-Authenticated-User-Email": "forged@example.invalid",
    },
  });

  const normalized = await normalizeRequestIdentity(request, {
    AUTH_PROVIDER: "chatgpt-sites",
  });

  assert.equal(normalized.headers.get("oai-authenticated-user-id"), "sites-user-123");
  assert.equal(normalized.headers.get("oai-authenticated-user-email"), "owner@example.com");
  assert.equal(
    normalized.headers.get("oai-authenticated-user-full-name"),
    "Example%20Owner",
  );
  assert.equal(normalized.headers.has("cf-access-jwt-assertion"), false);
  assert.equal(normalized.headers.has("cf-access-authenticated-user-email"), false);
});

test("Access mode verifies the exact issuer and audience before injecting identity", async () => {
  const fixture = await signingFixture();
  const assertion = await fixture.token();
  const request = new Request("https://dashboard.example.com/api/account", {
    headers: {
      "Cf-Access-Jwt-Assertion": assertion,
      "oai-authenticated-user-id": "forged-sites-user",
      "oai-authenticated-user-email": "forged@example.invalid",
    },
  });

  const normalized = await normalizeRequestIdentity(
    request,
    {
      AUTH_PROVIDER: "cloudflare-access",
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: "sample-team.cloudflareaccess.com",
      CLOUDFLARE_ACCESS_AUD: "REPLACE_WITH_ACCESS_APPLICATION_AUD",
    },
    { accessKeySet: fixture.keySet },
  );

  assert.equal(
    normalized.headers.get("oai-authenticated-user-id"),
    "cloudflare-access:access-user-123",
  );
  assert.equal(normalized.headers.get("oai-authenticated-user-email"), "owner@example.com");
  assert.equal(normalized.headers.has("cf-access-jwt-assertion"), false);
});

test("Access verification rejects invalid token boundaries and required claims", async () => {
  const fixture = await signingFixture();
  const env = {
    teamDomain: "sample-team.cloudflareaccess.com",
    audience: AUDIENCE,
  };
  const cases = [
    fixture.token({}, { issuer: "https://other-team.cloudflareaccess.com" }),
    fixture.token({}, { audience: "other-audience" }),
    fixture.token({}, { expiration: Math.floor(Date.now() / 1_000) - 60 }),
    fixture.token({ sub: "" }),
    fixture.token({ email: "not-an-email" }),
    fixture.token({ nbf: Math.floor(Date.now() / 1_000) + 300 }),
  ];

  for (const assertionPromise of cases) {
    await assert.rejects(
      verifyCloudflareAccessToken(
        await assertionPromise,
        env,
        fixture.keySet,
      ),
      /Cloudflare Access identity is invalid/,
    );
  }

  const otherFixture = await signingFixture();
  await assert.rejects(
    verifyCloudflareAccessToken(await otherFixture.token(), env, fixture.keySet),
    /Cloudflare Access identity is invalid/,
  );
  await assert.rejects(
    verifyCloudflareAccessToken("x".repeat(16_385), env, fixture.keySet),
    /Cloudflare Access identity is invalid/,
  );
  await assert.rejects(
    verifyCloudflareAccessToken(
      await fixture.token(),
      env,
      async () => {
        throw new Error("unavailable");
      },
    ),
    /Cloudflare Access identity is invalid/,
  );
});

test("missing or unknown providers strip forged identity and preserve request bodies", async () => {
  for (const provider of [undefined, "unknown-provider"]) {
    const request = new Request("https://dashboard.example.com/api/example", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-id": "forged-user",
        "oai-authenticated-user-email": "forged@example.invalid",
        "Cf-Access-Authenticated-User-Email": "forged@example.invalid",
      },
      body: '{"safe":true}',
    });

    const normalized = await normalizeRequestIdentity(request, {
      AUTH_PROVIDER: provider,
    });
    assert.equal(normalized.headers.has("oai-authenticated-user-id"), false);
    assert.equal(normalized.headers.has("oai-authenticated-user-email"), false);
    assert.equal(normalized.headers.has("cf-access-authenticated-user-email"), false);
    assert.equal(await normalized.text(), '{"safe":true}');
  }
});

test("Access mode never trusts unsigned email or forged Sites headers", async () => {
  const normalized = await normalizeRequestIdentity(
    new Request("https://dashboard.example.com/api/account", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "owner@example.com",
        "oai-authenticated-user-id": "forged-user",
        "oai-authenticated-user-email": "owner@example.com",
      },
    }),
    {
      AUTH_PROVIDER: "cloudflare-access",
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: "sample-team.cloudflareaccess.com",
      CLOUDFLARE_ACCESS_AUD: "REPLACE_WITH_ACCESS_APPLICATION_AUD",
    },
  );

  assert.equal(normalized.headers.has("oai-authenticated-user-id"), false);
  assert.equal(normalized.headers.has("oai-authenticated-user-email"), false);
});
