import { and, eq, lte } from "drizzle-orm";

import {
  getDb,
  ouraConnectionInvites,
} from "@/platform/database/server";
import { hashOAuthState } from "./token-crypto.ts";

const INVITE_LIFETIME_MS = 10 * 60 * 1_000;
const INVITE_BYTES = 32;
const RAW_INVITE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONNECT_PATH = "/connect/oura";

export interface ConnectionInviteRecord {
  inviteHash: string;
  ownerId: string;
  profileId: string;
  expiresAt: string;
  createdAt: string;
}

export interface ConnectionInviteBinding {
  ownerId: string;
  profileId: string;
  expiresAt: string;
}

export interface ConnectionInviteRepository {
  deleteExpired(cutoff: string): Promise<void>;
  replace(record: ConnectionInviteRecord): Promise<void>;
  inspect(inviteHash: string): Promise<ConnectionInviteRecord | null>;
  take(inviteHash: string): Promise<ConnectionInviteRecord | null>;
  cancel(ownerId: string, profileId: string): Promise<void>;
}

interface ConnectionInviteOptions {
  repository?: ConnectionInviteRepository;
}

export class ConnectionInviteError extends Error {
  readonly code = "unavailable" as const;

  constructor() {
    super("Connection invitation unavailable");
    this.name = "ConnectionInviteError";
  }
}

export async function issueConnectionInvite(
  ownerId: string,
  profileId: string,
  request: Request,
  now = new Date(),
  options: ConnectionInviteOptions = {},
): Promise<{ rawInvite: string; connectUrl: string; expiresAt: string }> {
  validateBinding(ownerId, profileId);
  const createdAt = validTimestamp(now);
  const rawInvite = randomInvite();
  const inviteHash = await safeHash(rawInvite);
  const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString();
  const connectUrl = connectionUrlFor(request, rawInvite);
  const repository = options.repository ?? dbConnectionInviteRepository();
  await repository.deleteExpired(createdAt);
  await repository.replace({
    inviteHash,
    ownerId,
    profileId,
    expiresAt,
    createdAt,
  });
  return { rawInvite, connectUrl, expiresAt };
}

export async function inspectConnectionInvite(
  rawInvite: string,
  now = new Date(),
  options: ConnectionInviteOptions = {},
): Promise<ConnectionInviteBinding> {
  const cutoff = validTimestamp(now);
  const inviteHash = await safeHash(rawInvite);
  const repository = options.repository ?? dbConnectionInviteRepository();
  await repository.deleteExpired(cutoff);
  const record = await repository.inspect(inviteHash);
  return validRecord(record, now);
}

export async function consumeConnectionInvite(
  rawInvite: string,
  now = new Date(),
  options: ConnectionInviteOptions = {},
): Promise<ConnectionInviteBinding> {
  const cutoff = validTimestamp(now);
  const inviteHash = await safeHash(rawInvite);
  const repository = options.repository ?? dbConnectionInviteRepository();
  await repository.deleteExpired(cutoff);
  const record = await repository.take(inviteHash);
  return validRecord(record, now);
}

export async function cancelConnectionInvite(
  ownerId: string,
  profileId: string,
  options: ConnectionInviteOptions = {},
): Promise<void> {
  validateBinding(ownerId, profileId);
  const repository = options.repository ?? dbConnectionInviteRepository();
  await repository.cancel(ownerId, profileId);
}

function dbConnectionInviteRepository(): ConnectionInviteRepository {
  const db = getDb();
  return {
    async deleteExpired(cutoff) {
      await db
        .delete(ouraConnectionInvites)
        .where(lte(ouraConnectionInvites.expiresAt, cutoff));
    },
    async replace(record) {
      await db
        .insert(ouraConnectionInvites)
        .values(record)
        .onConflictDoUpdate({
          target: [
            ouraConnectionInvites.ownerId,
            ouraConnectionInvites.profileId,
          ],
          set: {
            inviteHash: record.inviteHash,
            expiresAt: record.expiresAt,
            createdAt: record.createdAt,
          },
        });
    },
    async inspect(inviteHash) {
      const rows = await db
        .select()
        .from(ouraConnectionInvites)
        .where(eq(ouraConnectionInvites.inviteHash, inviteHash))
        .limit(1);
      return rows[0] ?? null;
    },
    async take(inviteHash) {
      const rows = await db
        .delete(ouraConnectionInvites)
        .where(eq(ouraConnectionInvites.inviteHash, inviteHash))
        .returning();
      return rows[0] ?? null;
    },
    async cancel(ownerId, profileId) {
      await db
        .delete(ouraConnectionInvites)
        .where(and(
          eq(ouraConnectionInvites.ownerId, ownerId),
          eq(ouraConnectionInvites.profileId, profileId),
        ));
    },
  };
}

function validRecord(
  record: ConnectionInviteRecord | null,
  now: Date,
): ConnectionInviteBinding {
  if (!record || Date.parse(record.expiresAt) <= now.getTime()) {
    throw new ConnectionInviteError();
  }
  return {
    ownerId: record.ownerId,
    profileId: record.profileId,
    expiresAt: record.expiresAt,
  };
}

async function safeHash(rawInvite: string): Promise<string> {
  if (
    typeof rawInvite !== "string" ||
    rawInvite.length > 256 ||
    !RAW_INVITE_PATTERN.test(rawInvite)
  ) {
    throw new ConnectionInviteError();
  }
  try {
    return await hashOAuthState(rawInvite);
  } catch {
    throw new ConnectionInviteError();
  }
}

function randomInvite(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function connectionUrlFor(request: Request, rawInvite: string): string {
  const url = new URL(request.url);
  if (
    (url.protocol !== "https:" && url.hostname !== "localhost") ||
    url.username ||
    url.password
  ) {
    throw new ConnectionInviteError();
  }
  url.pathname = CONNECT_PATH;
  url.search = "";
  url.hash = `invite=${rawInvite}`;
  return url.toString();
}

function validateBinding(ownerId: string, profileId: string): void {
  if (
    typeof ownerId !== "string" ||
    !ownerId ||
    ownerId.length > 1_024 ||
    typeof profileId !== "string" ||
    !profileId ||
    profileId.length > 1_024
  ) {
    throw new ConnectionInviteError();
  }
}

function validTimestamp(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ConnectionInviteError();
  }
  return now.toISOString();
}
