import {
  refreshState,
  type DailyHealthRecord,
  type DateRangeWindow,
  type HealthResponse,
} from "@/features/health-data/client";
import type { HealthProfileSummary } from "@/features/profile-management/client";

export interface ProfileLoadState {
  profile: HealthProfileSummary;
  records: HealthResponse["records"];
  updatedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  historyError: string | null;
  loadedStartDate: string | null;
  loadedEndDate: string | null;
}

export type HealthLoadFailureMode = "visible" | "silent";

const STALE_AFTER_MS = 3 * 60 * 60 * 1_000;

export function profileRefreshStatus(
  state: ProfileLoadState,
  now: Date,
): "fresh" | "stale" | "pending" {
  const { profile } = state;
  const refresh = refreshState(state.updatedAt, now);
  return state.error ||
    profile.safeErrorCode ||
    profile.status === "reauthorization_required"
      ? "stale"
      : state.refreshing ||
          (state.loading && !state.records.length) ||
          profile.status === "pending"
        ? "pending"
        : refresh.status;
}

export function resolveView(
  requested: string,
  profiles: HealthProfileSummary[],
): string {
  if (requested === "family" && profiles.length > 1) return "family";
  const selected = profiles.find(({ slug }) => slug === requested);
  return selected?.slug ?? profiles[0]?.slug ?? "";
}

export function isStale(lastSucceededAt: string | null, now: Date): boolean {
  if (!lastSucceededAt) return true;
  const completedAt = Date.parse(lastSucceededAt);
  return (
    Number.isNaN(completedAt) ||
    completedAt <= now.getTime() - STALE_AFTER_MS
  );
}

export function mergeHealthResults(
  current: ProfileLoadState[],
  requested: ProfileLoadState[],
  results: PromiseSettledResult<HealthResponse>[],
  window?: DateRangeWindow,
  failureMode: HealthLoadFailureMode = "visible",
  preserveHistoryErrorOnSuccess = false,
): ProfileLoadState[] {
  const byId = new Map(
    requested.map((profile, index) => [profile.profile.id, results[index]]),
  );
  return current.map((profile) => {
    const result = byId.get(profile.profile.id);
    if (!result) return profile;
    if (result.status === "rejected") {
      const error = healthLoadError(profile, result.reason);
      if (failureMode === "silent") {
        return { ...profile, historyError: error };
      }
      return {
        ...profile,
        loading: false,
        error,
      };
    }
    return healthState(
      profile,
      result.value,
      window,
      preserveHistoryErrorOnSuccess,
    );
  });
}

export function healthState(
  current: ProfileLoadState,
  health: HealthResponse,
  window?: DateRangeWindow,
  preserveHistoryError = false,
): ProfileLoadState {
  return {
    ...current,
    profile: {
      ...current.profile,
      lastSucceededAt: laterTimestamp(
        current.profile.lastSucceededAt,
        health.updatedAt,
      ),
    },
    records: mergeHealthRecords(current.records, health.records),
    updatedAt: laterTimestamp(current.updatedAt, health.updatedAt),
    loading: false,
    error: null,
    historyError: preserveHistoryError ? current.historyError : null,
    loadedStartDate: window
      ? earlierDate(current.loadedStartDate, window.start)
      : current.loadedStartDate,
    loadedEndDate: window
      ? laterDate(current.loadedEndDate, window.end)
      : current.loadedEndDate,
  };
}

function healthLoadError(
  profile: ProfileLoadState,
  reason: unknown,
): string {
  return reason instanceof Error
    ? reason.message
    : `${profile.profile.displayName} could not be loaded`;
}

export function coversHealthWindow(
  state: ProfileLoadState,
  window: DateRangeWindow,
): boolean {
  return (
    state.loadedStartDate !== null &&
    state.loadedEndDate !== null &&
    state.loadedStartDate <= window.start &&
    state.loadedEndDate >= window.end
  );
}

function mergeHealthRecords(
  current: DailyHealthRecord[],
  incoming: DailyHealthRecord[],
): DailyHealthRecord[] {
  const byDate = new Map(current.map((record) => [record.date, record]));
  for (const record of incoming) byDate.set(record.date, record);
  return [...byDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date)
  );
}

function earlierDate(current: string | null, incoming: string): string {
  return current === null || incoming < current ? incoming : current;
}

function laterDate(current: string | null, incoming: string): string {
  return current === null || incoming > current ? incoming : current;
}

function laterTimestamp(
  current: string | null,
  incoming: string | null,
): string | null {
  if (current === null) return incoming;
  if (incoming === null) return current;
  const currentTime = Date.parse(current);
  const incomingTime = Date.parse(incoming);
  if (Number.isNaN(currentTime)) return incoming;
  if (Number.isNaN(incomingTime)) return current;
  return incomingTime > currentTime ? incoming : current;
}
