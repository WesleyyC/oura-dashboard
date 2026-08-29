"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  rangeWindow,
  type DateRangeWindow,
  type HealthResponse,
  type RangeKey,
} from "@/features/health-data/client";
import type { ProfileRefreshResult } from "@/features/oura-connection/client";
import { runWithConcurrency } from "@/shared/async";
import {
  dateInTimeZone,
  resolveLocalTimeZone,
} from "@/shared/time-zone";
import {
  createDashboardApi,
  type DashboardApi,
} from "../client/dashboard-api";
import {
  isStale,
  mergeHealthResults,
  resolveView,
  type HealthLoadFailureMode,
  type ProfileLoadState,
} from "./dashboard-state";

const defaultDashboardApi = createDashboardApi((input, init) => fetch(input, init));

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

export interface DashboardController {
  view: string;
  range: RangeKey;
  profiles: ProfileLoadState[];
  profilesLoading: boolean;
  profileListError: string | null;
  now: Date;
  today: string;
  timeZone: string;
  setRange(range: RangeKey): void;
  changeView(view: string): void;
  refreshProfiles(targets: ProfileLoadState[], force?: boolean): Promise<void>;
  retryProfiles(): void;
}

export function useDashboardController(
  initialView: string,
  api: DashboardApi = defaultDashboardApi,
): DashboardController {
  const [view, setView] = useState(initialView);
  const [range, setRange] = useState<RangeKey>("7d");
  const [profiles, setProfiles] = useState<ProfileLoadState[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profileListError, setProfileListError] = useState<string | null>(null);
  const [cacheReloadToken, setCacheReloadToken] = useState(0);
  const [automaticCheckToken, setAutomaticCheckToken] = useState(0);
  const [historyLoadToken, setHistoryLoadToken] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [timeZone] = useState(resolveLocalTimeZone);
  const profilesRef = useRef(profiles);
  const automaticAttempts = useRef(new Map<string, string>());
  const historyRequested = useRef(false);
  const healthLoads = useRef(new Map<string, HealthLoadEntry>());
  const activeHealthLoads = useRef(new Set<HealthLoadEntry>());
  const nextHealthVersion = useRef(new Map<string, number>());
  const appliedHealthLoads = useRef(new Map<string, AppliedHealthLoad[]>());
  const today = dateInTimeZone(now, timeZone);
  const requiredHistoryStart = rangeWindow("6m", today).start;

  const requestHistoryLoad = useCallback(() => {
    if (historyRequested.current) return;
    historyRequested.current = true;
    setHistoryLoadToken((value) => value + 1);
  }, []);

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
  }, [requestHealthLoad]);

  const refreshProfiles = useCallback(async (
    targets: ProfileLoadState[],
    force = false,
  ) => {
    if (!targets.length) return;
    setProfiles((current) =>
      current.map((item) =>
        targets.some(({ profile }) => profile.id === item.profile.id)
          ? { ...item, refreshing: true }
          : item
      )
    );

    const results = await runWithConcurrency(targets, 2, (target) =>
      api.requestProfileRefresh(target.profile.id, timeZone, force)
    );
    await Promise.all(
      targets.map(async (target, index) => {
        const result = results[index];
        if (result.status === "rejected") {
          updateRefreshResult(target.profile.id, null);
          return;
        }
        updateRefreshResult(target.profile.id, result.value);
        if (
          result.value.status === "refreshed" ||
          result.value.status === "fresh"
        ) {
          const reloadWindow = loadedProfileWindow(target, today);
          await loadAndApplyProfile({
            profile: target,
            window: reloadWindow,
            afterCurrent: true,
            failureMessage: "Updated data could not be loaded",
            preserveHistoryError: reloadWindow.start > requiredHistoryStart,
          });
        }
      }),
    );

    function updateRefreshResult(
      profileId: string,
      result: ProfileRefreshResult | null,
    ) {
      setProfiles((current) =>
        current.map((item) => {
          if (item.profile.id !== profileId) return item;
          const authorizationRequired =
            result?.safeErrorCode === "authorization_required";
          const succeeded =
            result?.status === "refreshed" || result?.status === "fresh";
          return {
            ...item,
            refreshing: false,
            profile: {
              ...item.profile,
              status: authorizationRequired
                ? "reauthorization_required"
                : item.profile.status,
              lastSucceededAt:
                result?.lastSucceededAt ?? item.profile.lastSucceededAt,
              coverageStartDate:
                succeeded &&
                (
                  item.profile.coverageStartDate === null ||
                  item.profile.coverageStartDate > requiredHistoryStart
                )
                  ? requiredHistoryStart
                  : item.profile.coverageStartDate,
              safeErrorCode:
                result?.safeErrorCode ??
                (result ? null : "unexpected"),
            },
          };
        }),
      );
    }

  }, [
    api,
    loadAndApplyProfile,
    requiredHistoryStart,
    timeZone,
    today,
  ]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    const controller = new AbortController();
    historyRequested.current = false;
    for (const entry of activeHealthLoads.current) entry.controller.abort();
    healthLoads.current.clear();
    activeHealthLoads.current.clear();
    nextHealthVersion.current.clear();
    appliedHealthLoads.current.clear();

    async function initialize() {
      try {
        const summaries = await api.loadProfiles(controller.signal);
        if (controller.signal.aborted) return;
        const initialStates = summaries.map((profile) => ({
          profile,
          records: [],
          updatedAt: profile.lastSucceededAt,
          loading: true,
          refreshing: false,
          error: null,
          historyError: null,
          loadedStartDate: null,
          loadedEndDate: null,
        }));
        setProfiles(initialStates);
        setView(resolveView(initialView, summaries));
        setProfileListError(null);
        setProfilesLoading(false);

        const initialWindow = rangeWindow("7d", today);
        await Promise.allSettled(
          initialStates.map((profile) =>
            loadAndApplyProfile({
              profile,
              window: initialWindow,
              signal: controller.signal,
              preserveHistoryError: true,
            })
          ),
        );
        if (controller.signal.aborted) return;
        requestHistoryLoad();
        setAutomaticCheckToken((value) => value + 1);
      } catch {
        if (controller.signal.aborted) return;
        setProfileListError(
          "Profiles could not be loaded. Try again.",
        );
        setProfilesLoading(false);
      }
    }

    void initialize();
    return () => controller.abort();
  }, [
    api,
    initialView,
    loadAndApplyProfile,
    requestHistoryLoad,
    today,
  ]);

  useEffect(() => () => {
    for (const entry of activeHealthLoads.current) entry.controller.abort();
    healthLoads.current.clear();
    activeHealthLoads.current.clear();
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    const cachePoll = window.setInterval(
      () => setCacheReloadToken((value) => value + 1),
      5 * 60_000,
    );
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        setCacheReloadToken((value) => value + 1);
        setAutomaticCheckToken((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(cachePoll);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!historyLoadToken) return;
    const snapshot = profilesRef.current;
    if (!snapshot.length) {
      historyRequested.current = false;
      return;
    }
    const controller = new AbortController();
    const historyWindow = rangeWindow("6m", today);

    async function loadHistory() {
      await Promise.allSettled(
        snapshot.map((profile) =>
          loadAndApplyProfile({
            profile,
            window: historyWindow,
            signal: controller.signal,
            failureMode: "silent",
          })
        ),
      );
    }

    void loadHistory();
    return () => controller.abort();
  }, [historyLoadToken, loadAndApplyProfile, today]);

  useEffect(() => {
    if (!cacheReloadToken) return;
    const snapshot = profilesRef.current;
    if (!snapshot.length) return;
    const controller = new AbortController();

    async function reloadCachedProfiles() {
      await Promise.allSettled(
        snapshot.map((profile) => {
          const reloadWindow = loadedProfileWindow(profile, today);
          return loadAndApplyProfile({
            profile,
            window: reloadWindow,
            signal: controller.signal,
            preserveHistoryError: reloadWindow.start > requiredHistoryStart,
          });
        }),
      );
    }

    void reloadCachedProfiles();
    return () => controller.abort();
  }, [
    cacheReloadToken,
    loadAndApplyProfile,
    requiredHistoryStart,
    today,
  ]);

  useEffect(() => {
    if (!automaticCheckToken) return;
    const snapshot = profilesRef.current;
    const checkedAt = new Date();
    const staleProfiles = snapshot.filter(({ profile }) => {
      if (profile.status !== "connected") {
        return false;
      }
      const needsBackfill =
        profile.coverageStartDate === null ||
        profile.coverageStartDate > requiredHistoryStart;
      if (!needsBackfill && !isStale(profile.lastSucceededAt, checkedAt)) {
        return false;
      }
      const attemptKey =
        `${profile.lastSucceededAt ?? ""}:${profile.coverageStartDate ?? ""}`;
      return automaticAttempts.current.get(profile.id) !== attemptKey;
    });
    if (!staleProfiles.length) return;
    staleProfiles.forEach(({ profile }) => {
      automaticAttempts.current.set(
        profile.id,
        `${profile.lastSucceededAt ?? ""}:${profile.coverageStartDate ?? ""}`,
      );
    });
    void refreshProfiles(staleProfiles);
  }, [
    automaticCheckToken,
    refreshProfiles,
    requiredHistoryStart,
  ]);

  function changeView(next: string) {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  function changeRange(next: RangeKey) {
    setRange(next);
    if (next !== "7d") requestHistoryLoad();
  }

  function retryProfiles() {
    const retryHistory = range !== "7d" &&
      profilesRef.current.some(({ historyError }) => historyError !== null);
    setProfiles((current) =>
      current.map((profile) => ({
        ...profile,
        loading: !profile.records.length,
        error: null,
        historyError: null,
      }))
    );
    if (retryHistory) {
      historyRequested.current = false;
      requestHistoryLoad();
      return;
    }
    setCacheReloadToken((value) => value + 1);
  }

  return {
    view,
    range,
    profiles,
    profilesLoading,
    profileListError,
    now,
    today,
    timeZone,
    setRange: changeRange,
    changeView,
    refreshProfiles,
    retryProfiles,
  };
}

function loadedProfileWindow(
  profile: ProfileLoadState,
  today: string,
): DateRangeWindow {
  return profile.loadedStartDate && profile.loadedEndDate
    ? { start: profile.loadedStartDate, end: profile.loadedEndDate }
    : rangeWindow("7d", today);
}

function coversWindow(
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
