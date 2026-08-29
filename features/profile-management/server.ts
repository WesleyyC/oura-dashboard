export * from "./domain/contracts";
export * from "./domain/profile-colors";
export * from "./domain/validation";
export {
  MAX_HEALTH_PROFILES,
  ProfileLimitReachedError,
  ProfileNotFoundError,
  createProfileService,
  ensureHealthAccountWithRepository,
  type HealthAccountRepository,
} from "./server/profile-service";
export { profileLimitResponse } from "./server/profile-limit-response";

import type { ProfileUpdate } from "./domain/contracts";
import { createDrizzleProfileRepository } from "./server/profile-repository";
import { createProfileService } from "./server/profile-service";

const service = () => createProfileService(createDrizzleProfileRepository());

export const ensureHealthAccount = (ownerId: string, now?: Date) =>
  service().ensureAccount(ownerId, now);
export const listProfiles = (ownerId: string) =>
  service().listProfiles(ownerId);
export const createPendingProfile = (ownerId: string, displayName: string) =>
  service().createPendingProfile(ownerId, displayName);
export const updateProfile = (ownerId: string, input: ProfileUpdate) =>
  service().updateProfile(ownerId, input);
export const removeProfile = (ownerId: string, profileId: string) =>
  service().removeProfile(ownerId, profileId);
export const markProfileConnected = (ownerId: string, profileId: string) =>
  service().markProfileConnected(ownerId, profileId);
export const markProfileReauthorizationRequired = (
  ownerId: string,
  profileId: string,
) => service().markProfileReauthorizationRequired(ownerId, profileId);
export const deleteAccount = (ownerId: string) =>
  service().deleteAccount(ownerId);
export const getProfile = (ownerId: string, profileId: string) =>
  service().getProfile(ownerId, profileId);
