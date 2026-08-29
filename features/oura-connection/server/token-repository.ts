import { and, eq, sql } from "drizzle-orm";

import { getDb, ouraCredentials } from "@/platform/database/server";
import { getRuntimeEnv } from "@/platform/runtime/server";
import {
  decryptTokenSet,
  encryptTokenSet,
  ENCRYPTION_VERSION,
} from "./token-crypto.ts";
import type { OuraTokenSet } from "./token-contracts.ts";

export async function loadTokenSet(
  ownerId: string,
  profileId: string,
): Promise<OuraTokenSet | null> {
  const rows = await getDb()
    .select({
      ciphertext: ouraCredentials.ciphertext,
      nonce: ouraCredentials.nonce,
      encryptionVersion: ouraCredentials.encryptionVersion,
      expiresAt: ouraCredentials.expiresAt,
      grantedScopes: ouraCredentials.grantedScopes,
    })
    .from(ouraCredentials)
    .where(and(
      eq(ouraCredentials.ownerId, ownerId),
      eq(ouraCredentials.profileId, profileId),
    ))
    .limit(1);
  const record = rows[0];
  if (!record) return null;

  const tokens = await decryptTokenSet(
    record,
    {
      ownerId,
      profileId,
      version: record.encryptionVersion,
    },
    encryptionKey(),
  );
  if (
    tokens.expiresAt !== record.expiresAt ||
    JSON.stringify(tokens.grantedScopes) !== record.grantedScopes
  ) {
    throw new Error("Stored Oura credential metadata is invalid");
  }
  return tokens;
}

export async function saveTokenSet(
  ownerId: string,
  profileId: string,
  tokens: OuraTokenSet,
): Promise<void> {
  validateIdentity(ownerId, profileId);
  const encrypted = await encryptTokenSet(
    tokens,
    { ownerId, profileId, version: ENCRYPTION_VERSION },
    encryptionKey(),
  );
  const updatedAt = new Date().toISOString();
  const grantedScopes = JSON.stringify(tokens.grantedScopes);

  await getDb()
    .insert(ouraCredentials)
    .values({
      ownerId,
      profileId,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      encryptionVersion: encrypted.encryptionVersion,
      expiresAt: tokens.expiresAt,
      grantedScopes,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [
        ouraCredentials.ownerId,
        ouraCredentials.profileId,
      ],
      set: {
        ciphertext: sql`excluded.ciphertext`,
        nonce: sql`excluded.nonce`,
        encryptionVersion: sql`excluded.encryption_version`,
        expiresAt: sql`excluded.expires_at`,
        grantedScopes: sql`excluded.granted_scopes`,
        updatedAt,
      },
    });
}

export async function replaceTokenSet(
  ownerId: string,
  profileId: string,
  tokens: OuraTokenSet,
): Promise<void> {
  await saveTokenSet(ownerId, profileId, tokens);
}

function encryptionKey(): string {
  const value = getRuntimeEnv().OURA_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("Oura token encryption key is unavailable");
  return value;
}

function validateIdentity(ownerId: string, profileId: string): void {
  if (!ownerId || !profileId) {
    throw new Error("Oura credential identity is invalid");
  }
}
