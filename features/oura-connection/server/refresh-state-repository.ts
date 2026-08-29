import { and, eq, sql } from "drizzle-orm";

import type { SafeRefreshErrorCode } from "@/features/profile-management/client";
import {
  getDb,
  healthSyncStateProfile,
} from "@/platform/database/server";
import { getRuntimeEnv } from "@/platform/runtime/server";
import {
  dateInTimeZone,
  DEFAULT_TIME_ZONE,
} from "@/shared/time-zone";

const LEASE_MS = 5 * 60 * 1_000;

export interface RefreshStatusContext {
  ownerId: string;
  profileId: string;
  range: { start: string; end: string };
  rowCount: number;
  completedAt: string;
}

export interface RefreshFailureContext {
  ownerId: string;
  profileId: string;
  failedAt: string;
  safeErrorCode: SafeRefreshErrorCode;
}

export async function acquireRefreshLease(
  ownerId: string,
  profileId: string,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): Promise<boolean> {
  const attemptedAt = validTimestamp(now);
  const lockExpiresAt = new Date(now.getTime() + LEASE_MS).toISOString();
  const date = dateInTimeZone(now, timeZone);
  const db = getDb();
  await db
    .insert(healthSyncStateProfile)
    .values({
      ownerId,
      profileId,
      startDate: date,
      endDate: date,
      rowCount: 0,
      updatedAt: attemptedAt,
      lastAttemptAt: null,
      lastSucceededAt: null,
      status: "idle",
      safeErrorCode: null,
      lockExpiresAt: null,
    })
    .onConflictDoNothing();

  const binding = getRuntimeEnv().DB;
  if (!binding) throw new Error("Health database is unavailable");
  const result = await binding
    .prepare(`
      UPDATE health_sync_state_profile
      SET status = 'refreshing',
          last_attempt_at = ?,
          lock_expires_at = ?,
          safe_error_code = NULL
      WHERE owner_id = ?
        AND profile_id = ?
        AND (lock_expires_at IS NULL OR lock_expires_at <= ?)
    `)
    .bind(attemptedAt, lockExpiresAt, ownerId, profileId, attemptedAt)
    .run();
  return result.meta.changes === 1;
}

export async function markRefreshSuccess(
  context: RefreshStatusContext,
): Promise<void> {
  await getDb()
    .update(healthSyncStateProfile)
    .set({
      startDate: sql<string>`MIN(${healthSyncStateProfile.startDate}, ${context.range.start})`,
      endDate: sql<string>`MAX(${healthSyncStateProfile.endDate}, ${context.range.end})`,
      rowCount: context.rowCount,
      updatedAt: context.completedAt,
      lastSucceededAt: context.completedAt,
      status: "succeeded",
      safeErrorCode: null,
      lockExpiresAt: null,
    })
    .where(and(
      eq(healthSyncStateProfile.ownerId, context.ownerId),
      eq(healthSyncStateProfile.profileId, context.profileId),
    ));
}

export async function markRefreshFailure(
  context: RefreshFailureContext,
): Promise<void> {
  await getDb()
    .update(healthSyncStateProfile)
    .set({
      updatedAt: context.failedAt,
      status: "failed",
      safeErrorCode: context.safeErrorCode,
      lockExpiresAt: null,
    })
    .where(and(
      eq(healthSyncStateProfile.ownerId, context.ownerId),
      eq(healthSyncStateProfile.profileId, context.profileId),
    ));
}

function validTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Refresh time is invalid");
  return now.toISOString();
}
