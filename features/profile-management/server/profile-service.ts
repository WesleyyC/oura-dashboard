import {
  type HealthAccount,
  type HealthProfileStatus,
  type HealthProfileSummary,
  type ProfileSlug,
  type ProfileUpdate,
} from "../domain/contracts";
import { nextProfileColorKey } from "../domain/profile-colors";
import {
  normalizeProfileSlug,
  parseProfileDisplayName,
  parseProfileId,
} from "../domain/validation";
import {
  ProfileLimitPersistenceError,
  ProfileSlugConflictError,
  type ProfilePersistenceUpdate,
  type ProfileRepository,
} from "./profile-repository";

export type HealthAccountRepository = Pick<
  ProfileRepository,
  "findAccount" | "createAccount"
>;

export const MAX_HEALTH_PROFILES = 8;

export class ProfileNotFoundError extends Error {
  constructor() {
    super("Profile not found");
    this.name = "ProfileNotFoundError";
  }
}

export class ProfileLimitReachedError extends Error {
  constructor() {
    super("Health profile limit reached");
    this.name = "ProfileLimitReachedError";
  }
}

export interface ProfileService {
  ensureAccount(ownerId: string, now?: Date): Promise<HealthAccount>;
  listProfiles(ownerId: string): Promise<HealthProfileSummary[]>;
  createPendingProfile(
    ownerId: string,
    displayName: string,
  ): Promise<HealthProfileSummary>;
  updateProfile(
    ownerId: string,
    input: ProfileUpdate,
  ): Promise<HealthProfileSummary>;
  removeProfile(ownerId: string, profileId: string): Promise<void>;
  markProfileConnected(ownerId: string, profileId: string): Promise<void>;
  markProfileReauthorizationRequired(
    ownerId: string,
    profileId: string,
  ): Promise<void>;
  deleteAccount(ownerId: string): Promise<void>;
  getProfile(
    ownerId: string,
    profileId: string,
  ): Promise<HealthProfileSummary | null>;
}

export async function ensureHealthAccountWithRepository(
  repository: HealthAccountRepository,
  ownerId: string,
  now = new Date(),
): Promise<HealthAccount> {
  validateOwnerId(ownerId);
  const timestamp = validTimestamp(now);
  const existing = await repository.findAccount(ownerId);
  return existing ?? repository.createAccount(ownerId, timestamp);
}

export function createProfileService(
  repository: ProfileRepository,
): ProfileService {
  const ensureAccount = (ownerId: string, now = new Date()) =>
    ensureHealthAccountWithRepository(repository, ownerId, now);

  const getProfile = async (ownerId: string, rawProfileId: string) => {
    validateOwnerId(ownerId);
    return repository.getProfile(ownerId, parseProfileId(rawProfileId));
  };

  const setStatus = async (
    ownerId: string,
    rawProfileId: string,
    status: HealthProfileStatus,
  ) => {
    const profileId = parseProfileId(rawProfileId);
    if (!await getProfile(ownerId, profileId)) throw new ProfileNotFoundError();
    await repository.updateProfile(ownerId, profileId, {
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  return {
    ensureAccount,
    async listProfiles(ownerId) {
      validateOwnerId(ownerId);
      await ensureAccount(ownerId);
      return repository.listProfiles(ownerId);
    },
    async createPendingProfile(ownerId, rawDisplayName) {
      validateOwnerId(ownerId);
      const displayName = parseProfileDisplayName(rawDisplayName);
      await ensureAccount(ownerId);
      const existing = await repository.listProfiles(ownerId);
      if (existing.length >= MAX_HEALTH_PROFILES) {
        throw new ProfileLimitReachedError();
      }
      const existingSlugs = new Set(existing.map(({ slug }) => slug));
      const baseSlug = normalizeProfileSlug(displayName);
      const sortOrder = existing.reduce(
        (highest, profile) => Math.max(highest, profile.sortOrder),
        -1,
      ) + 1;
      const colorKey = nextProfileColorKey(
        existing.map(({ colorKey: existingColor }) => existingColor),
        sortOrder,
      );

      for (let suffix = 1; suffix <= 100; suffix += 1) {
        const slug = suffixedSlug(baseSlug, suffix);
        if (existingSlugs.has(slug)) continue;
        try {
          return await repository.insertPendingProfile({
            ownerId,
            id: crypto.randomUUID(),
            slug,
            displayName,
            colorKey,
            sortOrder,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          if (error instanceof ProfileLimitPersistenceError) {
            throw new ProfileLimitReachedError();
          }
          if (error instanceof ProfileSlugConflictError) {
            existingSlugs.add(slug);
            continue;
          }
          throw error;
        }
      }
      throw new Error("Unable to allocate a unique profile slug");
    },
    async updateProfile(ownerId, input) {
      validateOwnerId(ownerId);
      const profileId = parseProfileId(input.profileId);
      const current = await getProfile(ownerId, profileId);
      if (!current) throw new ProfileNotFoundError();
      const updates: ProfilePersistenceUpdate = {
        updatedAt: new Date().toISOString(),
      };
      if (input.displayName !== undefined) {
        updates.displayName = parseProfileDisplayName(input.displayName);
      }
      if (input.colorKey !== undefined) updates.colorKey = input.colorKey;
      if (input.sortOrder !== undefined) {
        validateSortOrder(input.sortOrder);
        updates.sortOrder = input.sortOrder;
      }
      if (input.disabled === true) {
        updates.status = "disabled";
      } else if (input.disabled === false && current.status === "disabled") {
        updates.status = await repository.hasCredential(ownerId, profileId)
          ? "connected"
          : "pending";
      }
      await repository.updateProfile(ownerId, profileId, updates);
      const updated = await getProfile(ownerId, profileId);
      if (!updated) throw new ProfileNotFoundError();
      return updated;
    },
    async removeProfile(ownerId, rawProfileId) {
      validateOwnerId(ownerId);
      const profileId = parseProfileId(rawProfileId);
      if (!await getProfile(ownerId, profileId)) throw new ProfileNotFoundError();
      await repository.removeProfile(ownerId, profileId);
    },
    markProfileConnected(ownerId, profileId) {
      return setStatus(ownerId, profileId, "connected");
    },
    markProfileReauthorizationRequired(ownerId, profileId) {
      return setStatus(ownerId, profileId, "reauthorization_required");
    },
    async deleteAccount(ownerId) {
      validateOwnerId(ownerId);
      await repository.deleteAccount(ownerId);
    },
    getProfile,
  };
}

function validateSortOrder(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error("sortOrder must be an integer from 0 through 10000");
  }
}

function suffixedSlug(base: ProfileSlug, suffix: number): ProfileSlug {
  if (suffix === 1) return base;
  const suffixText = `-${suffix}`;
  const prefix = base.slice(0, 32 - suffixText.length).replace(/-+$/g, "");
  return `${prefix}${suffixText}` as ProfileSlug;
}

function validateOwnerId(ownerId: string): void {
  if (
    typeof ownerId !== "string" ||
    !ownerId ||
    ownerId.length > 255 ||
    ownerId.trim() !== ownerId
  ) {
    throw new Error("Trusted owner ID is invalid");
  }
}

function validTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Account timestamp is invalid");
  return now.toISOString();
}
