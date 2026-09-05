import type { SafeRefreshErrorCode } from "@/features/profile-management/client";

export interface RefreshDiagnostic {
  profileId: string;
  status: "idle" | "refreshing" | "interrupted" | "succeeded" | "failed";
  lastAttemptAt: string | null;
  lastSucceededAt: string | null;
  durationMs: number | null;
  lastSuccessfulRowCount: number;
  safeErrorCode: SafeRefreshErrorCode | null;
}

export interface RefreshDiagnostics {
  checkedAt: string;
  profiles: RefreshDiagnostic[];
}
