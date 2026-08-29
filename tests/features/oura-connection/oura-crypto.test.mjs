import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decryptTokenSet,
  encryptTokenSet,
  hashOAuthState,
  isValidEncryptionKeyText,
} from "../../../features/oura-connection/server/token-crypto.ts";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64url");
const TOKENS = {
  accessToken: "access-a",
  refreshToken: "refresh-a",
  expiresAt: "2026-07-30T18:00:00.000Z",
  grantedScopes: ["daily", "workout"],
};
const CONTEXT = {
  ownerId: "owner-a",
  profileId: "profile-a",
  version: 1,
};

test("AES-GCM token records are bound to owner and profile", async () => {
  const encrypted = await encryptTokenSet(TOKENS, CONTEXT, TEST_KEY);

  assert.equal(encrypted.encryptionVersion, 1);
  assert.doesNotMatch(JSON.stringify(encrypted), /access-a|refresh-a/);
  assert.deepEqual(
    await decryptTokenSet(encrypted, CONTEXT, TEST_KEY),
    TOKENS,
  );
  await assert.rejects(
    decryptTokenSet(
      encrypted,
      { ...CONTEXT, ownerId: "owner-b" },
      TEST_KEY,
    ),
    /decrypt/i,
  );
  await assert.rejects(
    decryptTokenSet(
      encrypted,
      { ...CONTEXT, profileId: "profile-b" },
      TEST_KEY,
    ),
    /decrypt/i,
  );
});

test("every encrypted token record uses a fresh 96-bit nonce", async () => {
  const first = await encryptTokenSet(TOKENS, CONTEXT, TEST_KEY);
  const second = await encryptTokenSet(TOKENS, CONTEXT, TEST_KEY);

  assert.notEqual(first.nonce, second.nonce);
  assert.equal(Buffer.from(first.nonce, "base64url").byteLength, 12);
  assert.equal(Buffer.from(second.nonce, "base64url").byteLength, 12);
});

test("token encryption rejects invalid keys without echoing their values", async () => {
  const invalid = "this-is-not-a-secret-key";
  await assert.rejects(
    encryptTokenSet(TOKENS, CONTEXT, invalid),
    (error) =>
      error instanceof Error &&
      /encryption key/i.test(error.message) &&
      !error.message.includes(invalid),
  );
});

test("token encryption configuration accepts only 32-byte base64url keys", () => {
  assert.equal(isValidEncryptionKeyText(TEST_KEY), true);
  assert.equal(
    isValidEncryptionKeyText(Buffer.alloc(31, 7).toString("base64url")),
    false,
  );
  assert.equal(
    isValidEncryptionKeyText(Buffer.alloc(32, 255).toString("base64")),
    false,
  );
  assert.equal(isValidEncryptionKeyText("not-a-key"), false);
  assert.equal(isValidEncryptionKeyText(undefined), false);
});

test("OAuth state hashes are deterministic without storing raw state", async () => {
  const first = await hashOAuthState("state-a");
  assert.equal(first, await hashOAuthState("state-a"));
  assert.notEqual(first, "state-a");
  assert.equal(Buffer.from(first, "base64url").byteLength, 32);
});

test("token vault scopes every lookup and write to owner plus profile", async () => {
  const source = await readFile(
    new URL(
      "../../../features/oura-connection/server/token-repository.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /eq\(ouraCredentials\.ownerId,\s*ownerId\)/);
  assert.match(source, /eq\(ouraCredentials\.profileId,\s*profileId\)/);
  assert.match(
    source,
    /target:\s*\[\s*ouraCredentials\.ownerId,\s*ouraCredentials\.profileId,?\s*\]/s,
  );
  assert.match(source, /getRuntimeEnv\(\)\.OURA_TOKEN_ENCRYPTION_KEY/);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
});
