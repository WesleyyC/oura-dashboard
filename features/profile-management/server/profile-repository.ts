import { and, asc, eq } from "drizzle-orm";

import {
  getDb,
  healthAccounts,
  healthProfiles,
  healthSyncStateProfile,
  ouraCredentials,
} from "@/platform/database/server";
import {
  type HealthAccount,
  type HealthProfileStatus,
  type HealthProfileSummary,
  type ProfileSlug,
  type SafeRefreshErrorCode,
} from "../domain/contracts";
import {
  resolveProfileColorKey,
  type ProfileColorKey,
} from "../domain/profile-colors";

const PROFILE_LIMIT_MARKER = "health_profile_limit_reached";

export interface ProfilePersistenceUpdate {
  displayName?: string;
  colorKey?: ProfileColorKey;
  sortOrder?: number;
  status?: HealthProfileStatus;
  updatedAt: string;
}

export interface PendingProfileInput {
  ownerId: string;
  id: string;
  slug: ProfileSlug;
  displayName: string;
  colorKey: ProfileColorKey;
  sortOrder: number;
  updatedAt: string;
}

export interface ProfileRepository {
  findAccount(ownerId: string): Promise<HealthAccount | null>;
  createAccount(ownerId: string, createdAt: string): Promise<HealthAccount>;
  listProfiles(ownerId: string): Promise<HealthProfileSummary[]>;
  getProfile(
    ownerId: string,
    profileId: string,
  ): Promise<HealthProfileSummary | null>;
  insertPendingProfile(input: PendingProfileInput): Promise<HealthProfileSummary>;
  updateProfile(
    ownerId: string,
    profileId: string,
    updates: ProfilePersistenceUpdate,
  ): Promise<void>;
  hasCredential(ownerId: string, profileId: string): Promise<boolean>;
  removeProfile(ownerId: string, profileId: string): Promise<void>;
  deleteAccount(ownerId: string): Promise<void>;
}

export class ProfileLimitPersistenceError extends Error {
  constructor() {
    super("Profile persistence limit reached");
    this.name = "ProfileLimitPersistenceError";
  }
}

export class ProfileSlugConflictError extends Error {
  constructor() {
    super("Profile slug conflict");
    this.name = "ProfileSlugConflictError";
  }
}

const PROFILE_COLUMNS = {
  id: healthProfiles.id,
  slug: healthProfiles.slug,
  displayName: healthProfiles.displayName,
  colorKey: healthProfiles.colorKey,
  sortOrder: healthProfiles.sortOrder,
  status: healthProfiles.status,
  updatedAt: healthProfiles.updatedAt,
  lastSucceededAt: healthSyncStateProfile.lastSucceededAt,
  coverageStartDate: healthSyncStateProfile.startDate,
  safeErrorCode: healthSyncStateProfile.safeErrorCode,
};

const ACCOUNT_COLUMNS = {
  ownerId: healthAccounts.ownerId,
  createdAt: healthAccounts.createdAt,
  legacyClaimedAt: healthAccounts.legacyClaimedAt,
};

export function createDrizzleProfileRepository(): ProfileRepository {
  const db = getDb();
  return {
    async findAccount(ownerId) {
      const rows = await db
        .select(ACCOUNT_COLUMNS)
        .from(healthAccounts)
        .where(eq(healthAccounts.ownerId, ownerId))
        .limit(1);
      return rows[0] ?? null;
    },
    async createAccount(ownerId, createdAt) {
      await db
        .insert(healthAccounts)
        .values({ ownerId, createdAt, legacyClaimedAt: null })
        .onConflictDoNothing();
      const rows = await db
        .select(ACCOUNT_COLUMNS)
        .from(healthAccounts)
        .where(eq(healthAccounts.ownerId, ownerId))
        .limit(1);
      if (!rows[0]) throw new Error("Health account creation failed");
      return rows[0];
    },
    async listProfiles(ownerId) {
      const rows = await profileSelection()
        .where(eq(healthProfiles.ownerId, ownerId))
        .orderBy(asc(healthProfiles.sortOrder), asc(healthProfiles.id));
      return rows.map(toProfileSummary);
    },
    async getProfile(ownerId, profileId) {
      const rows = await profileSelection()
        .where(and(
          eq(healthProfiles.ownerId, ownerId),
          eq(healthProfiles.id, profileId),
        ))
        .limit(1);
      return rows[0] ? toProfileSummary(rows[0]) : null;
    },
    async insertPendingProfile(input) {
      try {
        await db.insert(healthProfiles).values({
          id: input.id,
          ownerId: input.ownerId,
          slug: input.slug,
          displayName: input.displayName,
          colorKey: input.colorKey,
          sortOrder: input.sortOrder,
          status: "pending",
          createdAt: input.updatedAt,
          updatedAt: input.updatedAt,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(PROFILE_LIMIT_MARKER)
        ) {
          throw new ProfileLimitPersistenceError();
        }
        const collision = await db
          .select({ id: healthProfiles.id })
          .from(healthProfiles)
          .where(and(
            eq(healthProfiles.ownerId, input.ownerId),
            eq(healthProfiles.slug, input.slug),
          ))
          .limit(1);
        if (collision.length) throw new ProfileSlugConflictError();
        throw error;
      }
      return {
        id: input.id,
        slug: input.slug,
        displayName: input.displayName,
        colorKey: input.colorKey,
        sortOrder: input.sortOrder,
        status: "pending",
        updatedAt: input.updatedAt,
        lastSucceededAt: null,
        coverageStartDate: null,
        safeErrorCode: null,
      };
    },
    async updateProfile(ownerId, profileId, updates) {
      await db
        .update(healthProfiles)
        .set(updates)
        .where(and(
          eq(healthProfiles.ownerId, ownerId),
          eq(healthProfiles.id, profileId),
        ));
    },
    async hasCredential(ownerId, profileId) {
      const rows = await db
        .select({ profileId: ouraCredentials.profileId })
        .from(ouraCredentials)
        .where(and(
          eq(ouraCredentials.ownerId, ownerId),
          eq(ouraCredentials.profileId, profileId),
        ))
        .limit(1);
      return Boolean(rows.length);
    },
    async removeProfile(ownerId, profileId) {
      await db
        .delete(healthProfiles)
        .where(and(
          eq(healthProfiles.ownerId, ownerId),
          eq(healthProfiles.id, profileId),
        ));
    },
    async deleteAccount(ownerId) {
      await db
        .delete(healthAccounts)
        .where(eq(healthAccounts.ownerId, ownerId));
    },
  };

  function profileSelection() {
    return db
      .select(PROFILE_COLUMNS)
      .from(healthProfiles)
      .leftJoin(
        healthSyncStateProfile,
        and(
          eq(healthSyncStateProfile.ownerId, healthProfiles.ownerId),
          eq(healthSyncStateProfile.profileId, healthProfiles.id),
        ),
      );
  }
}

function toProfileSummary(row: {
  id: string;
  slug: string;
  displayName: string;
  colorKey: string | null;
  sortOrder: number;
  status: string;
  updatedAt: string;
  lastSucceededAt: string | null;
  coverageStartDate: string | null;
  safeErrorCode: string | null;
}): HealthProfileSummary {
  return {
    id: row.id,
    slug: row.slug as ProfileSlug,
    displayName: row.displayName,
    colorKey: resolveProfileColorKey(row.colorKey, row.id),
    sortOrder: row.sortOrder,
    status: parseProfileStatus(row.status),
    updatedAt: row.updatedAt,
    lastSucceededAt: row.lastSucceededAt,
    coverageStartDate: row.coverageStartDate,
    safeErrorCode: row.safeErrorCode as SafeRefreshErrorCode | null,
  };
}

function parseProfileStatus(value: string): HealthProfileStatus {
  if (
    value === "pending" ||
    value === "connected" ||
    value === "reauthorization_required" ||
    value === "disabled"
  ) {
    return value;
  }
  throw new Error("Stored profile status is invalid");
}
