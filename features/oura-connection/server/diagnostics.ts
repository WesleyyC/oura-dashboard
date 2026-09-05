import { and, asc, eq } from "drizzle-orm";
import { SAFE_REFRESH_ERROR_CODES, type SafeRefreshErrorCode } from "@/features/profile-management/client";
import { getDb, healthProfiles, healthSyncStateProfile as sync } from "@/platform/database/server";
import type { RefreshDiagnostic, RefreshDiagnostics } from "../domain/diagnostics";

// Intentionally select a small metadata allowlist, never health or credential rows.
export async function loadRefreshDiagnostics(ownerId: string, now = new Date()): Promise<RefreshDiagnostics> {
  const rows = await getDb().select({
    profileId: healthProfiles.id,
    status: sync.status,
    lastAttemptAt: sync.lastAttemptAt,
    lastSucceededAt: sync.lastSucceededAt,
    updatedAt: sync.updatedAt,
    rowCount: sync.rowCount,
    safeErrorCode: sync.safeErrorCode,
    lockExpiresAt: sync.lockExpiresAt,
  }).from(healthProfiles).leftJoin(sync, and(
    eq(sync.ownerId, healthProfiles.ownerId), eq(sync.profileId, healthProfiles.id),
  )).where(eq(healthProfiles.ownerId, ownerId)).orderBy(asc(healthProfiles.sortOrder)).limit(100);
  return {
    checkedAt: now.toISOString(),
    profiles: rows.map((row): RefreshDiagnostic => {
      const interrupted = row.status === "refreshing" &&
        (!row.lockExpiresAt || !(Date.parse(row.lockExpiresAt) > now.getTime()));
      const status = interrupted ? "interrupted" :
        row.status === "refreshing" || row.status === "succeeded" || row.status === "failed"
          ? row.status : "idle";
      const attempt = timestamp(row.lastAttemptAt);
      const completed = timestamp(row.updatedAt);
      const duration = attempt && completed ? Date.parse(completed) - Date.parse(attempt) : null;
      return {
        profileId: row.profileId,
        status,
        lastAttemptAt: attempt,
        lastSucceededAt: timestamp(row.lastSucceededAt),
        durationMs: (status === "failed" || status === "succeeded") && duration !== null && duration >= 0 ? duration : null,
        lastSuccessfulRowCount: Number.isSafeInteger(row.rowCount) && row.rowCount! >= 0 ? row.rowCount! : 0,
        safeErrorCode: interrupted ? "refresh_interrupted" : row.safeErrorCode === null ? null :
          SAFE_REFRESH_ERROR_CODES.includes(row.safeErrorCode as SafeRefreshErrorCode) ? row.safeErrorCode as SafeRefreshErrorCode : "unexpected",
      };
    }),
  };
}

function timestamp(value: string | null): string | null {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
