import type { ProfileColorKey } from "./profile-colors";

export type ProfileSlug = string & { readonly __profileSlug: unique symbol };
export type HealthProfileStatus =
  | "pending"
  | "connected"
  | "reauthorization_required"
  | "disabled";
export const SAFE_REFRESH_ERROR_CODES = [
  "authorization_required",
  "configuration_missing",
  "oura_unavailable",
  "rate_limited",
  "storage_failed",
  "refresh_interrupted",
  "unexpected",
] as const;
export type SafeRefreshErrorCode = (typeof SAFE_REFRESH_ERROR_CODES)[number];

export interface HealthAccount {
  ownerId: string;
  createdAt: string;
  legacyClaimedAt: string | null;
}

export interface HealthProfileSummary {
  id: string;
  slug: ProfileSlug;
  displayName: string;
  colorKey: ProfileColorKey;
  sortOrder: number;
  status: HealthProfileStatus;
  updatedAt: string;
  lastSucceededAt: string | null;
  coverageStartDate: string | null;
  safeErrorCode: SafeRefreshErrorCode | null;
}

export interface ProfileUpdate {
  profileId: string;
  displayName?: string;
  colorKey?: ProfileColorKey;
  sortOrder?: number;
  disabled?: boolean;
}
