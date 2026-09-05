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
  resolveView,
  type ProfileLoadState,
} from "./dashboard-state";

import { coversWindow, useProfileHealthCache } from "./use-profile-health-cache";

const defaultDashboardApi = createDashboardApi((input, init) => fetch(input, init));

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
  const [profileListToken, setProfileListToken] = useState(0);
  const [cacheReloadToken, setCacheReloadToken] = useState(0);
  const [automaticCheckToken, setAutomaticCheckToken] = useState(0);
  const [historyLoadToken, setHistoryLoadToken] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [timeZone] = useState(resolveLocalTimeZone);
  const profilesRef = useRef(profiles);
  const automaticAttempts = useRef(new Map<string, string>());
  const historyRequested = useRef(new Set<string>());
  const lifecycle = useRef(0);
  const today = dateInTimeZone(now, timeZone);
  const requiredHistoryStart = rangeWindow("6m", today).start;

  const requestHistoryLoad = useCallback(() => {
    setHistoryLoadToken((value) => value + 1);
  }, []);

  const { loadAndApplyProfile, resetHealthCache } = useProfileHealthCache(api, setProfiles);

  const refreshProfiles = useCallback(async (
    targets: ProfileLoadState[],
    force = false,
  ) => {
    if (!targets.length) return;
    const generation = lifecycle.current;
    setProfiles((current) =>
      current.map((item) =>
        targets.some(({ profile }) => profile.id === item.profile.id)
          ? { ...item, refreshing: true }
          : item
      )
    );

    await runWithConcurrency(targets, 2, async (target) => {
        if (generation !== lifecycle.current) return;
        let result: ProfileRefreshResult;
        try {
          result = await api.requestProfileRefresh(target.profile.id, timeZone, force);
        } catch {
          if (generation !== lifecycle.current) return;
          updateRefreshResult(target.profile.id, null);
          return;
        }
        if (generation !== lifecycle.current) return;
        updateRefreshResult(target.profile.id, result);
        if (
          result.status === "refreshed" ||
          result.status === "fresh"
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
      },
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
    lifecycle.current += 1;
    historyRequested.current.clear();
    automaticAttempts.current.clear();
    resetHealthCache();

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
        await runWithConcurrency(
          profilesInView(initialStates, resolveView(initialView, summaries)), 2,
          (profile) =>
            loadAndApplyProfile({
              profile,
              window: initialWindow,
              signal: controller.signal,
              preserveHistoryError: true,
            })
          ,
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
    return () => {
      lifecycle.current += 1;
      controller.abort();
    };
  }, [
    api,
    initialView,
    profileListToken,
    loadAndApplyProfile,
    requestHistoryLoad,
    resetHealthCache,
    today,
  ]);


  useEffect(() => {
    const clock = window.setInterval(() => {
      if (document.visibilityState !== "hidden") setNow(new Date());
    }, 60_000);
    const cachePoll = window.setInterval(
      () => {
        if (document.visibilityState !== "hidden") setCacheReloadToken((value) => value + 1);
      },
      5 * 60_000,
    );
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        setCacheReloadToken((value) => value + 1);
        setAutomaticCheckToken((value) => value + 1);
        requestHistoryLoad();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(cachePoll);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [requestHistoryLoad]);

  useEffect(() => {
    if (!historyLoadToken || document.visibilityState === "hidden") return;
    const snapshot = profilesInView(profilesRef.current, view);
    if (!snapshot.length) return;
    const historyWindow = rangeWindow("6m", today);
    const targets = snapshot.filter((profile) => {
      const key = `${profile.profile.id}:${historyWindow.start}:${historyWindow.end}`;
      if (historyRequested.current.has(key)) return false;
      if (profile.loadedStartDate && profile.loadedEndDate && coversWindow(
        { start: profile.loadedStartDate, end: profile.loadedEndDate }, historyWindow,
      )) return false;
      historyRequested.current.add(key);
      return true;
    });

    async function loadHistory() {
      const generation = lifecycle.current;
      await runWithConcurrency(targets, 2, async (profile) => {
          if (generation !== lifecycle.current) return;
          await loadAndApplyProfile({
            profile,
            window: historyWindow,
            failureMode: "silent",
          })
        }
      );
    }

    void loadHistory();
    // Requests belong to the cache lifecycle, not a range selector render.
    // Initialization/unmount aborts their entry controllers. A changed view
    // must not discard a deduplicated request that is still filling its cache.
  }, [historyLoadToken, loadAndApplyProfile, today, view]);

  useEffect(() => {
    if (!cacheReloadToken || document.visibilityState === "hidden") return;
    const snapshot = profilesInView(profilesRef.current, view);
    if (!snapshot.length) return;
    const controller = new AbortController();

    async function reloadCachedProfiles() {
      await runWithConcurrency(snapshot, 2, (profile) => {
          const reloadWindow = loadedProfileWindow(profile, today);
          return loadAndApplyProfile({
            profile,
            window: reloadWindow,
            signal: controller.signal,
            preserveHistoryError: reloadWindow.start > requiredHistoryStart,
          });
        },
      );
    }

    void reloadCachedProfiles();
    return () => controller.abort();
  }, [
    cacheReloadToken,
    loadAndApplyProfile,
    requiredHistoryStart,
    today,
    view,
  ]);

  useEffect(() => {
    if (!automaticCheckToken || document.visibilityState === "hidden") return;
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
    }).sort((left, right) => Number(right.profile.slug === view) - Number(left.profile.slug === view));
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
    view,
  ]);

  function changeView(next: string) {
    setView(next);
    setCacheReloadToken((value) => value + 1);
    requestHistoryLoad();
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  function changeRange(next: RangeKey) {
    setRange(next);
    if (next !== "7d") requestHistoryLoad();
  }

  function retryProfiles() {
    if (profileListError) {
      setProfilesLoading(true);
      setProfileListToken((value) => value + 1);
      return;
    }
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
      historyRequested.current.clear();
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

function profilesInView(profiles: ProfileLoadState[], view: string): ProfileLoadState[] {
  return view === "family" ? profiles : profiles.filter(({ profile }) => profile.slug === view);
}

function loadedProfileWindow(
  profile: ProfileLoadState,
  today: string,
): DateRangeWindow {
  return profile.loadedStartDate && profile.loadedEndDate
    ? { start: profile.loadedStartDate, end: profile.loadedEndDate }
    : rangeWindow("7d", today);
}
