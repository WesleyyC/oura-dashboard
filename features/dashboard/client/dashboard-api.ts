import {
  type DateRangeWindow,
  type HealthResponse,
} from "@/features/health-data/client";
import type { HealthProfileSummary } from "@/features/profile-management/client";
import type { ProfileRefreshResult } from "@/features/oura-connection/client";
import type { ProfileLoadState } from "../model/dashboard-state";

export interface DashboardApi {
  loadProfiles(signal?: AbortSignal): Promise<HealthProfileSummary[]>;
  loadHealthProfile(
    profile: ProfileLoadState,
    window: DateRangeWindow,
    signal?: AbortSignal,
  ): Promise<HealthResponse>;
  requestProfileRefresh(
    profileId: string,
    timeZone: string,
    force?: boolean,
  ): Promise<ProfileRefreshResult>;
}

export function createDashboardApi(fetchImpl: typeof fetch = fetch): DashboardApi {
  return {
    async loadProfiles(signal) {
      const response = await fetchImpl("/api/profiles", {
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as {
        profiles?: HealthProfileSummary[];
      };
      if (!response.ok || !Array.isArray(body.profiles)) {
        throw new Error("Profiles unavailable");
      }
      return body.profiles;
    },

    async loadHealthProfile(profile, window, signal) {
      const { start, end } = window;
      const response = await fetchImpl(
        `/api/health?profile=${profile.profile.slug}&start=${start}&end=${end}`,
        {
          signal,
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as HealthResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? `${profile.profile.displayName} could not be loaded`,
        );
      }
      if (
        payload.profile.id !== profile.profile.id ||
        payload.profile.slug !== profile.profile.slug
      ) {
        throw new Error(
          `${profile.profile.displayName} returned a mismatched profile`,
        );
      }
      return payload;
    },

    async requestProfileRefresh(profileId, timeZone, force = false) {
      const response = await fetchImpl("/api/oura/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          timeZone,
          ...(force ? { force: true } : {}),
        }),
        cache: "no-store",
      });
      const payload = (await response.json()) as Partial<ProfileRefreshResult>;
      if (
        typeof payload.profileId !== "string" ||
        typeof payload.status !== "string" ||
        !("lastSucceededAt" in payload) ||
        !("safeErrorCode" in payload)
      ) {
        throw new Error("Refresh unavailable");
      }
      return payload as ProfileRefreshResult;
    },
  };
}
