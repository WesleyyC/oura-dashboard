import {
  rangeWindow,
  writeHealthRecords,
  type DailyHealthRecord,
} from "@/features/health-data/server";
import {
  listProfiles,
  type HealthProfileSummary,
  type SafeRefreshErrorCode,
} from "@/features/profile-management/server";
import { LostRefreshLeaseError, type RefreshLease } from "@/platform/database/server";
import { abortable, withDeadline } from "@/shared/abortable";
import type { ProfileRefreshResult } from "../domain/public-contracts";
import {
  dateInTimeZone,
  DEFAULT_TIME_ZONE,
} from "@/shared/time-zone";
import { collectOuraAggregates } from "./collect-aggregates.ts";
import { OuraApiError } from "./oura-client.ts";
import {
  refreshOAuthTokens,
  SafeOuraError,
  type OuraOAuthConfig,
} from "./oauth-service.ts";
import {
  loadTokenSet,
  replaceTokenSet,
} from "./token-repository.ts";
import {
  acquireRefreshLease,
  markRefreshFailure,
  markRefreshSuccess,
  markRefreshReauthorizationRequired,
  type RefreshFailureContext,
  type RefreshStatusContext,
} from "./refresh-state-repository.ts";
import type { OuraTokenSet } from "./token-contracts.ts";

const STALE_AFTER_MS = 3 * 60 * 60 * 1_000;
const ROTATE_EARLY_MS = 60 * 1_000;
const REFRESH_DEADLINE_MS = 4 * 60 * 1_000;

export interface RefreshProfileOptions {
  force?: boolean;
  repairHistory?: boolean;
  timeZone?: string;
  deadlineMs?: number;
  cleanupDeadlineMs?: number;
  now?: () => Date;
  oauthConfig?: OuraOAuthConfig;
  loadProfile?: (
    ownerId: string,
    profileId: string,
  ) => Promise<HealthProfileSummary | null>;
  acquireLease?: (
    ownerId: string,
    profileId: string,
    now: Date,
    timeZone: string,
  ) => Promise<RefreshLease | null>;
  loadTokens?: (
    ownerId: string,
    profileId: string,
  ) => Promise<OuraTokenSet | null>;
  rotateTokens?: (tokens: OuraTokenSet, signal: AbortSignal) => Promise<OuraTokenSet>;
  saveTokens?: (
    ownerId: string,
    profileId: string,
    tokens: OuraTokenSet,
    lease: RefreshLease,
  ) => Promise<void>;
  collect?: (
    tokens: OuraTokenSet,
    profile: HealthProfileSummary,
    range: { start: string; end: string },
    signal: AbortSignal,
  ) => Promise<DailyHealthRecord[]>;
  writeRecords?: (
    ownerId: string,
    profileId: string,
    records: DailyHealthRecord[],
    completedAt: string,
    lease: RefreshLease,
  ) => Promise<void>;
  markSuccess?: (context: RefreshStatusContext) => Promise<void>;
  markFailure?: (context: RefreshFailureContext) => Promise<void>;
  markReauthorizationRequired?: (
    ownerId: string,
    profileId: string,
    lease: RefreshLease,
  ) => Promise<void>;
}

export function isProfileStale(
  lastSucceededAt: string | null,
  now = new Date(),
): boolean {
  if (!lastSucceededAt || Number.isNaN(now.getTime())) return true;
  const completedAt = Date.parse(lastSucceededAt);
  if (Number.isNaN(completedAt) || completedAt > now.getTime()) return true;
  return completedAt <= now.getTime() - STALE_AFTER_MS;
}

export async function refreshProfile(
  ownerId: string,
  profileId: string,
  options: RefreshProfileOptions = {},
): Promise<ProfileRefreshResult> {
  return withDeadline(
    (signal) => executeRefresh(ownerId, profileId, options, signal),
    Math.min(options.deadlineMs ?? REFRESH_DEADLINE_MS, REFRESH_DEADLINE_MS),
  );
}

async function executeRefresh(
  ownerId: string,
  profileId: string,
  options: RefreshProfileOptions,
  signal: AbortSignal,
): Promise<ProfileRefreshResult> {
  const run = <T>(operation: () => Promise<T>) => {
    signal.throwIfAborted();
    return abortable(operation(), signal);
  };
  const now = options.now ?? (() => new Date());
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const loadProfile = options.loadProfile ?? defaultLoadProfile;
  let profile: HealthProfileSummary | null;
  try {
    profile = await run(() => loadProfile(ownerId, profileId));
  } catch {
    return failedResult(profileId, null, signal.aborted ? "refresh_interrupted" : "storage_failed");
  }
  if (!profile || profile.status !== "connected") {
    return failedResult(
      profileId,
      profile?.lastSucceededAt ?? null,
      "authorization_required",
    );
  }
  const startedAt = now();
  const historyRange = rangeWindow("6m", dateInTimeZone(startedAt, timeZone));
  const needsBackfill =
    options.repairHistory === true ||
    profile.coverageStartDate === null ||
    profile.coverageStartDate > historyRange.start;
  if (
    !options.force &&
    !needsBackfill &&
    !isProfileStale(profile.lastSucceededAt, startedAt)
  ) {
    return {
      profileId,
      status: "fresh",
      lastSucceededAt: profile.lastSucceededAt,
      safeErrorCode: null,
    };
  }

  const acquireLease = options.acquireLease ?? acquireRefreshLease;
  let lease: RefreshLease;
  try {
    const acquired = await run(() => acquireLease(ownerId, profileId, startedAt, timeZone));
    if (!acquired) {
      return {
        profileId,
        status: "already_running",
        lastSucceededAt: profile.lastSucceededAt,
        safeErrorCode: null,
      };
    }
    lease = acquired;
  } catch {
    return failedResult(
      profileId,
      profile.lastSucceededAt,
      signal.aborted ? "refresh_interrupted" : "storage_failed",
    );
  }

  const loadTokens = options.loadTokens ?? loadTokenSet;
  const saveTokens = options.saveTokens ?? replaceTokenSet;
  const rotateTokens =
    options.rotateTokens ??
    ((tokens: OuraTokenSet, signal: AbortSignal) => {
      if (!options.oauthConfig) {
        throw new SafeOuraError("configuration_missing");
      }
      return refreshOAuthTokens(
        options.oauthConfig,
        tokens.refreshToken,
        fetch,
        now(),
        signal,
      );
    });
  const collect =
    options.collect ??
    ((tokens, loadedProfile, range, signal) =>
      collectOuraAggregates(
        loadedProfile.slug,
        range,
        tokens.accessToken,
        { signal },
      ));
  const writeRecords =
    options.writeRecords ??
    (async (targetOwnerId, targetProfileId, records, completedAt, lease) => {
      await writeHealthRecords(
        targetOwnerId,
        targetProfileId,
        records,
        completedAt,
        lease,
      );
    });
  const markSuccess = options.markSuccess ?? markRefreshSuccess;
  const markFailure = options.markFailure ?? markRefreshFailure;
  const markReauthorization =
    options.markReauthorizationRequired ??
    markRefreshReauthorizationRequired;

  try {
    const loadedTokens = await run(() => loadTokens(ownerId, profileId));
    if (!loadedTokens) throw new RefreshFailure("authorization_required");
    let tokens: OuraTokenSet = loadedTokens;
    if (shouldRotate(tokens, startedAt)) {
      tokens = await run(() => rotateTokens(tokens, signal));
      try {
        await run(() => saveTokens(ownerId, profileId, tokens, lease));
      } catch (error) {
        if (error instanceof LostRefreshLeaseError) throw error;
        throw new RefreshFailure("storage_failed");
      }
    }

    const range = needsBackfill
      ? historyRange
      : catchUpRange(profile.lastSucceededAt, startedAt, timeZone, historyRange);
    let records: DailyHealthRecord[];
    try {
      records = await run(() => collect(tokens, profile, range, signal));
    } catch (error) {
      if (!(error instanceof OuraApiError) || error.code !== "unauthorized") {
        throw error;
      }
      tokens = await run(() => rotateTokens(tokens, signal));
      try {
        await run(() => saveTokens(ownerId, profileId, tokens, lease));
      } catch (error) {
        if (error instanceof LostRefreshLeaseError) throw error;
        throw new RefreshFailure("storage_failed");
      }
      try {
        records = await run(() => collect(tokens, profile, range, signal));
      } catch (retryError) {
        if (
          retryError instanceof OuraApiError &&
          retryError.code === "unauthorized"
        ) {
          throw new RefreshFailure("authorization_required");
        }
        throw retryError;
      }
    }

    const completedAt = validTimestamp(now());
    try {
      await run(() => writeRecords(ownerId, profileId, records, completedAt, lease));
      await run(() => markSuccess({
        ownerId,
        profileId,
        range,
        rowCount: records.length,
        completedAt,
        lease,
      }));
    } catch (error) {
      if (error instanceof LostRefreshLeaseError) throw error;
      throw new RefreshFailure("storage_failed");
    }
    return {
      profileId,
      status: "refreshed",
      lastSucceededAt: completedAt,
      safeErrorCode: null,
    };
  } catch (error) {
    let safeErrorCode = signal.aborted ? "refresh_interrupted" as const : safeRefreshError(error);
    if (safeErrorCode === "authorization_required") {
      try {
        await run(() => markReauthorization(ownerId, profileId, lease));
      } catch (error) {
        safeErrorCode = signal.aborted || error instanceof LostRefreshLeaseError ? "refresh_interrupted" : "storage_failed";
      }
    }
    try {
      await withDeadline((cleanupSignal) => abortable(markFailure({
        ownerId,
        profileId,
        failedAt: validTimestamp(now()),
        safeErrorCode,
        lease,
      }), cleanupSignal), Math.min(options.cleanupDeadlineMs ?? 5_000, 5_000));
    } catch (error) {
      safeErrorCode = signal.aborted || error instanceof LostRefreshLeaseError ? "refresh_interrupted" : "storage_failed";
    }
    return failedResult(
      profileId,
      profile.lastSucceededAt,
      safeErrorCode,
    );
  }
}

async function defaultLoadProfile(
  ownerId: string,
  profileId: string,
): Promise<HealthProfileSummary | null> {
  return (await listProfiles(ownerId)).find(({ id }) => id === profileId) ?? null;
}

function shouldRotate(tokens: OuraTokenSet, now: Date): boolean {
  const expiresAt = Date.parse(tokens.expiresAt);
  return (
    Number.isNaN(expiresAt) ||
    expiresAt <= now.getTime() + ROTATE_EARLY_MS
  );
}

function safeRefreshError(error: unknown): SafeRefreshErrorCode {
  if (error instanceof LostRefreshLeaseError) return "refresh_interrupted";
  if (error instanceof RefreshFailure) return error.code;
  if (error instanceof OuraApiError) {
    switch (error.code) {
      case "unauthorized":
        return "authorization_required";
      case "rate_limited":
        return "rate_limited";
      case "unavailable":
        return "oura_unavailable";
      case "invalid_request":
      case "invalid_response":
      case "pagination":
        return "unexpected";
    }
  }
  if (error instanceof SafeOuraError) {
    switch (error.code) {
      case "oauth_grant_rejected":
        return "authorization_required";
      case "configuration_missing":
      case "oauth_client_rejected":
      case "oauth_request_rejected":
      case "oauth_scope_rejected":
        return "configuration_missing";
      case "token_endpoint_unavailable":
        return "oura_unavailable";
      case "token_endpoint_rate_limited":
        return "rate_limited";
      default:
        return "unexpected";
    }
  }
  return "unexpected";
}

class RefreshFailure extends Error {
  readonly code: SafeRefreshErrorCode;

  constructor(code: SafeRefreshErrorCode) {
    super(code);
    this.name = "RefreshFailure";
    this.code = code;
  }
}

function failedResult(
  profileId: string,
  lastSucceededAt: string | null,
  safeErrorCode: SafeRefreshErrorCode,
): ProfileRefreshResult {
  return {
    profileId,
    status: "failed",
    lastSucceededAt,
    safeErrorCode,
  };
}

function catchUpRange(
  lastSucceededAt: string | null,
  now: Date,
  timeZone: string,
  historyRange: { start: string; end: string },
): { start: string; end: string } {
  const completedAt = lastSucceededAt ? Date.parse(lastSucceededAt) : NaN;
  if (!Number.isFinite(completedAt) || completedAt > now.getTime()) {
    return historyRange;
  }
  const end = historyRange.end;
  const startDate = new Date(`${end}T00:00:00.000Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  const rollingStart = startDate.toISOString().slice(0, 10);
  // Keep the revision overlap, but never skip days since the last successful
  // collection. Include that local day, which may only have been partial.
  const previousDay = dateInTimeZone(new Date(completedAt), timeZone);
  const catchUpStart = previousDay < rollingStart ? previousDay : rollingStart;
  return { start: catchUpStart < historyRange.start ? historyRange.start : catchUpStart, end };
}

function validTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Refresh time is invalid");
  return now.toISOString();
}
