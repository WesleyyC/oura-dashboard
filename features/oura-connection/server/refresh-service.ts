import {
  rangeWindow,
  writeHealthRecords,
  type DailyHealthRecord,
} from "@/features/health-data/server";
import {
  listProfiles,
  markProfileReauthorizationRequired,
  type HealthProfileSummary,
  type SafeRefreshErrorCode,
} from "@/features/profile-management/server";
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
  type RefreshFailureContext,
  type RefreshStatusContext,
} from "./refresh-state-repository.ts";
import type { OuraTokenSet } from "./token-contracts.ts";

const STALE_AFTER_MS = 3 * 60 * 60 * 1_000;
const ROTATE_EARLY_MS = 60 * 1_000;

export interface RefreshProfileOptions {
  force?: boolean;
  timeZone?: string;
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
  ) => Promise<boolean>;
  loadTokens?: (
    ownerId: string,
    profileId: string,
  ) => Promise<OuraTokenSet | null>;
  rotateTokens?: (tokens: OuraTokenSet) => Promise<OuraTokenSet>;
  saveTokens?: (
    ownerId: string,
    profileId: string,
    tokens: OuraTokenSet,
  ) => Promise<void>;
  collect?: (
    tokens: OuraTokenSet,
    profile: HealthProfileSummary,
    range: { start: string; end: string },
  ) => Promise<DailyHealthRecord[]>;
  writeRecords?: (
    ownerId: string,
    profileId: string,
    records: DailyHealthRecord[],
    completedAt: string,
  ) => Promise<void>;
  markSuccess?: (context: RefreshStatusContext) => Promise<void>;
  markFailure?: (context: RefreshFailureContext) => Promise<void>;
  markReauthorizationRequired?: (
    ownerId: string,
    profileId: string,
  ) => Promise<void>;
}

export function isProfileStale(
  lastSucceededAt: string | null,
  now = new Date(),
): boolean {
  if (!lastSucceededAt || Number.isNaN(now.getTime())) return true;
  const completedAt = Date.parse(lastSucceededAt);
  if (Number.isNaN(completedAt)) return true;
  return completedAt <= now.getTime() - STALE_AFTER_MS;
}

export async function refreshProfile(
  ownerId: string,
  profileId: string,
  options: RefreshProfileOptions = {},
): Promise<ProfileRefreshResult> {
  const now = options.now ?? (() => new Date());
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const loadProfile = options.loadProfile ?? defaultLoadProfile;
  let profile: HealthProfileSummary | null;
  try {
    profile = await loadProfile(ownerId, profileId);
  } catch {
    return failedResult(profileId, null, "storage_failed");
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

  const lease = options.acquireLease ?? acquireRefreshLease;
  try {
    if (!await lease(ownerId, profileId, startedAt, timeZone)) {
      return {
        profileId,
        status: "already_running",
        lastSucceededAt: profile.lastSucceededAt,
        safeErrorCode: null,
      };
    }
  } catch {
    return failedResult(
      profileId,
      profile.lastSucceededAt,
      "storage_failed",
    );
  }

  const loadTokens = options.loadTokens ?? loadTokenSet;
  const saveTokens = options.saveTokens ?? replaceTokenSet;
  const rotateTokens =
    options.rotateTokens ??
    ((tokens: OuraTokenSet) => {
      if (!options.oauthConfig) {
        throw new SafeOuraError("configuration_missing");
      }
      return refreshOAuthTokens(
        options.oauthConfig,
        tokens.refreshToken,
      );
    });
  const collect =
    options.collect ??
    ((tokens, loadedProfile, range) =>
      collectOuraAggregates(
        loadedProfile.slug,
        range,
        tokens.accessToken,
      ));
  const writeRecords =
    options.writeRecords ??
    (async (targetOwnerId, targetProfileId, records, completedAt) => {
      await writeHealthRecords(
        targetOwnerId,
        targetProfileId,
        records,
        completedAt,
      );
    });
  const markSuccess = options.markSuccess ?? markRefreshSuccess;
  const markFailure = options.markFailure ?? markRefreshFailure;
  const markReauthorization =
    options.markReauthorizationRequired ??
    markProfileReauthorizationRequired;

  try {
    let tokens = await loadTokens(ownerId, profileId);
    if (!tokens) throw new RefreshFailure("authorization_required");
    if (shouldRotate(tokens, startedAt)) {
      tokens = await rotateTokens(tokens);
      try {
        await saveTokens(ownerId, profileId, tokens);
      } catch {
        throw new RefreshFailure("storage_failed");
      }
    }

    const range = needsBackfill
      ? historyRange
      : rollingEightDayRange(startedAt, timeZone);
    let records: DailyHealthRecord[];
    try {
      records = await collect(tokens, profile, range);
    } catch (error) {
      if (!(error instanceof OuraApiError) || error.code !== "unauthorized") {
        throw error;
      }
      tokens = await rotateTokens(tokens);
      try {
        await saveTokens(ownerId, profileId, tokens);
      } catch {
        throw new RefreshFailure("storage_failed");
      }
      try {
        records = await collect(tokens, profile, range);
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
      await writeRecords(ownerId, profileId, records, completedAt);
      await markSuccess({
        ownerId,
        profileId,
        range,
        rowCount: records.length,
        completedAt,
      });
    } catch {
      throw new RefreshFailure("storage_failed");
    }
    return {
      profileId,
      status: "refreshed",
      lastSucceededAt: completedAt,
      safeErrorCode: null,
    };
  } catch (error) {
    let safeErrorCode = safeRefreshError(error);
    if (safeErrorCode === "authorization_required") {
      try {
        await markReauthorization(ownerId, profileId);
      } catch {
        safeErrorCode = "storage_failed";
      }
    }
    try {
      await markFailure({
        ownerId,
        profileId,
        failedAt: validTimestamp(now()),
        safeErrorCode,
      });
    } catch {
      safeErrorCode = "storage_failed";
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
    return error.code === "configuration_missing"
      ? "configuration_missing"
      : error.code === "token_exchange_failed"
        ? "authorization_required"
        : "unexpected";
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

function rollingEightDayRange(
  now: Date,
  timeZone: string,
): { start: string; end: string } {
  const end = dateInTimeZone(now, timeZone);
  const startDate = new Date(`${end}T00:00:00.000Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  return { start: startDate.toISOString().slice(0, 10), end };
}

function validTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Refresh time is invalid");
  return now.toISOString();
}
