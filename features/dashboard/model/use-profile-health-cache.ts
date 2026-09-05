"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { DateRangeWindow, HealthResponse } from "@/features/health-data/client";
import type { DashboardApi } from "../client/dashboard-api";
import { mergeHealthResults, type HealthLoadFailureMode, type ProfileLoadState } from "./dashboard-state";

interface HealthLoadEntry {
  promise: Promise<HealthResponse>;
  version: number;
  profileId: string;
  window: DateRangeWindow;
  controller: AbortController;
  applied: boolean;
  failureMode: HealthLoadFailureMode;
  preserveHistoryError: boolean;
  failureMessage?: string;
}

interface AppliedHealthLoad {
  version: number;
  window: DateRangeWindow;
}

export function useProfileHealthCache(api: DashboardApi, setProfiles: Dispatch<SetStateAction<ProfileLoadState[]>>) {
  const healthLoads = useRef(new Map<string, HealthLoadEntry>());
  const activeHealthLoads = useRef(new Set<HealthLoadEntry>());
  const nextHealthVersion = useRef(new Map<string, number>());
  const appliedHealthLoads = useRef(new Map<string, AppliedHealthLoad[]>());
  const requestHealthLoad = useCallback((
    profile: ProfileLoadState,
    window: DateRangeWindow,
    {
      afterCurrent = false,
      failureMode = "visible",
      preserveHistoryError = false,
      failureMessage,
    }: {
      afterCurrent?: boolean;
      failureMode?: HealthLoadFailureMode;
      preserveHistoryError?: boolean;
      failureMessage?: string;
    } = {},
  ): HealthLoadEntry => {
    const key = [
      profile.profile.id,
      profile.profile.slug,
      window.start,
      window.end,
    ].join(":");
    const current = healthLoads.current.get(key);
    if (current && !afterCurrent) return current;

    const pendingForProfile = afterCurrent
      ? [...activeHealthLoads.current].filter((entry) =>
          entry.profileId === profile.profile.id
        )
      : [];
    const version = (nextHealthVersion.current.get(profile.profile.id) ?? 0) + 1;
    nextHealthVersion.current.set(profile.profile.id, version);
    const controller = new AbortController();
    const promise = (async () => {
      if (pendingForProfile.length) {
        await Promise.allSettled(pendingForProfile.map(({ promise }) => promise));
      }
      controller.signal.throwIfAborted();
      return api.loadHealthProfile(profile, window, controller.signal);
    })();
    const entry = {
      promise,
      version,
      controller,
      applied: false,
      window,
      failureMode,
      preserveHistoryError,
      failureMessage,
      profileId: profile.profile.id,
    };
    healthLoads.current.set(key, entry);
    activeHealthLoads.current.add(entry);
    const removeEntry = () => {
      if (healthLoads.current.get(key) === entry) {
        healthLoads.current.delete(key);
      }
      activeHealthLoads.current.delete(entry);
    };
    void promise.then(removeEntry, removeEntry);
    return entry;
  }, [api]);

  const loadAndApplyProfile = useCallback(async ({
    profile,
    window,
    signal,
    failureMode = "visible",
    preserveHistoryError = false,
    afterCurrent = false,
    failureMessage,
  }: {
    profile: ProfileLoadState;
    window: DateRangeWindow;
    signal?: AbortSignal;
    failureMode?: "visible" | "silent";
    preserveHistoryError?: boolean;
    afterCurrent?: boolean;
    failureMessage?: string;
  }) => {
    if (signal?.aborted) return;
    const entry = requestHealthLoad(profile, window, {
      afterCurrent,
      failureMode,
      preserveHistoryError,
      failureMessage,
    });
    try {
      const health = await entry.promise;
      if (entry.controller.signal.aborted || signal?.aborted) return;
      if (entry.applied) return;
      entry.applied = true;
      const applied = appliedHealthLoads.current.get(profile.profile.id) ?? [];
      const newerLoads = applied.filter(({ version }) => version > entry.version);
      if (newerLoads.some(({ window }) => coversWindow(window, entry.window))) {
        return;
      }
      const protectedWindows = newerLoads.map(({ window }) => window);
      const safeHealth = protectedWindows.length
        ? {
            ...health,
            records: health.records.filter(({ date }) =>
              !protectedWindows.some((window) => dateInWindow(date, window))
            ),
          }
        : health;
      appliedHealthLoads.current.set(
        profile.profile.id,
        rememberAppliedLoad(applied, entry),
      );
      setProfiles((current) =>
        mergeHealthResults(
          current,
          [profile],
          [{ status: "fulfilled", value: safeHealth }],
          window,
          entry.failureMode,
          entry.preserveHistoryError,
        )
      );
    } catch (reason) {
      if (entry.controller.signal.aborted || signal?.aborted) return;
      if (entry.applied) return;
      entry.applied = true;
      const applied = appliedHealthLoads.current.get(profile.profile.id) ?? [];
      if (
        applied.some(({ version, window }) =>
          version > entry.version && coversWindow(window, entry.window)
        )
      ) return;
      setProfiles((current) =>
        mergeHealthResults(
          current,
          [profile],
          [{
            status: "rejected",
            reason: entry.failureMessage
              ? new Error(entry.failureMessage)
              : reason,
          }],
          window,
          entry.failureMode,
        )
      );
    }
  }, [requestHealthLoad, setProfiles]);

  const resetHealthCache = useCallback(() => {
    for (const entry of activeHealthLoads.current) entry.controller.abort();
    healthLoads.current.clear();
    activeHealthLoads.current.clear();
    nextHealthVersion.current.clear();
    appliedHealthLoads.current.clear();
  }, []);

  useEffect(() => resetHealthCache, [resetHealthCache]);
  return { loadAndApplyProfile, resetHealthCache };
}

export function coversWindow(
  coverage: DateRangeWindow,
  requested: DateRangeWindow,
): boolean {
  return coverage.start <= requested.start && coverage.end >= requested.end;
}

function dateInWindow(date: string, window: DateRangeWindow): boolean {
  return date >= window.start && date <= window.end;
}

function rememberAppliedLoad(
  applied: AppliedHealthLoad[],
  entry: HealthLoadEntry,
): AppliedHealthLoad[] {
  return [
    ...applied.filter(({ version, window }) =>
      version > entry.version || !coversWindow(entry.window, window)
    ),
    { version: entry.version, window: entry.window },
  ];
}
