import type {
  EncryptedTokenRecord,
  OuraTokenSet,
  TokenContext,
} from "./token-contracts.ts";

const ALGORITHM = "AES-GCM";
export const ENCRYPTION_VERSION = 1;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export async function encryptTokenSet(
  input: OuraTokenSet,
  context: TokenContext,
  keyText: string,
): Promise<EncryptedTokenRecord> {
  const tokens = parseTokenSet(input);
  validateContext(context);
  const key = await importEncryptionKey(keyText);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const plaintext = encoder.encode(JSON.stringify(tokens));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: nonce,
      additionalData: additionalData(context),
    },
    key,
    plaintext,
  );

  return {
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
    nonce: toBase64Url(nonce),
    encryptionVersion: ENCRYPTION_VERSION,
  };
}

export async function decryptTokenSet(
  record: EncryptedTokenRecord,
  context: TokenContext,
  keyText: string,
): Promise<OuraTokenSet> {
  validateContext(context);
  if (record.encryptionVersion !== ENCRYPTION_VERSION) {
    throw new Error("Unsupported Oura credential encryption version");
  }
  const key = await importEncryptionKey(keyText);

  try {
    const nonce = fromBase64Url(record.nonce);
    if (nonce.byteLength !== NONCE_BYTES) {
      throw new Error("Invalid nonce");
    }
    const ciphertext = fromBase64Url(record.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: nonce,
        additionalData: additionalData(context),
      },
      key,
      ciphertext,
    );
    return parseTokenSet(JSON.parse(decoder.decode(plaintext)));
  } catch {
    throw new Error("Unable to decrypt Oura credentials");
  }
}

export async function hashOAuthState(rawState: string): Promise<string> {
  if (
    typeof rawState !== "string" ||
    !rawState ||
    rawState.length > 2_048
  ) {
    throw new Error("OAuth state is invalid");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawState));
  return toBase64Url(new Uint8Array(digest));
}

export function isValidEncryptionKeyText(keyText: unknown): boolean {
  if (
    typeof keyText !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(keyText)
  ) {
    return false;
  }
  try {
    return fromBase64Url(keyText).byteLength === KEY_BYTES;
  } catch {
    return false;
  }
}

function additionalData(context: TokenContext): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `health-rhythm:v${context.version}:${context.ownerId}:${context.profileId}`,
  );
}

async function importEncryptionKey(keyText: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    if (
      typeof keyText !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(keyText)
    ) {
      throw new Error("Invalid key");
    }
    keyBytes = fromBase64Url(keyText);
  } catch {
    throw new Error("Oura token encryption key is invalid");
  }
  if (keyBytes.byteLength !== KEY_BYTES) {
    throw new Error("Oura token encryption key must decode to 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"],
  );
}

function parseTokenSet(input: unknown): OuraTokenSet {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Oura token set is invalid");
  }
  const value = input as Record<string, unknown>;
  const expected = new Set([
    "accessToken",
    "refreshToken",
    "expiresAt",
    "grantedScopes",
  ]);
  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new Error("Oura token set is invalid");
  }
  if (
    typeof value.accessToken !== "string" ||
    !value.accessToken ||
    value.accessToken.length > 8_192 ||
    typeof value.refreshToken !== "string" ||
    !value.refreshToken ||
    value.refreshToken.length > 8_192
  ) {
    throw new Error("Oura token set is invalid");
  }
  if (
    typeof value.expiresAt !== "string" ||
    Number.isNaN(Date.parse(value.expiresAt)) ||
    new Date(value.expiresAt).toISOString() !== value.expiresAt
  ) {
    throw new Error("Oura token expiry is invalid");
  }
  if (
    !Array.isArray(value.grantedScopes) ||
    !value.grantedScopes.length ||
    value.grantedScopes.some(
      (scope) =>
        typeof scope !== "string" ||
        !/^[a-z][a-z0-9_:-]{0,63}$/i.test(scope),
    ) ||
    new Set(value.grantedScopes).size !== value.grantedScopes.length
  ) {
    throw new Error("Oura token scopes are invalid");
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
    grantedScopes: [...value.grantedScopes] as string[],
  };
}

function validateContext(context: TokenContext): void {
  if (
    context.version !== ENCRYPTION_VERSION ||
    typeof context.ownerId !== "string" ||
    !context.ownerId ||
    typeof context.profileId !== "string" ||
    !context.profileId
  ) {
    throw new Error("Oura token context is invalid");
  }
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
  if (
    typeof value !== "string" ||
    !value ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
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
