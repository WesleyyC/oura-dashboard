import type { SafeRefreshErrorCode } from "@/features/profile-management/client";

export type OuraConnectionTarget =
  | { mode: "add"; displayName: string }
  | { mode: "reconnect"; profileId: string };

export interface ProfileRefreshResult {
  profileId: string;
  status: "fresh" | "refreshed" | "already_running" | "failed";
  lastSucceededAt: string | null;
  safeErrorCode: SafeRefreshErrorCode | null;
}
