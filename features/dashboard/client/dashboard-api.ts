import {
  type DateRangeWindow,
  type HealthResponse,
} from "@/features/health-data/client";
import { SAFE_REFRESH_ERROR_CODES, type HealthProfileSummary } from "@/features/profile-management/client";
import type { ProfileRefreshResult } from "@/features/oura-connection/client";
import { abortable, withDeadline } from "@/shared/abortable";
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

export function createDashboardApi(
  fetchImpl: typeof fetch = fetch,
  { readTimeoutMs = 30_000, refreshTimeoutMs = 270_000 } = {},
): DashboardApi {
  async function request(input: string, init: RequestInit, timeout: number) {
    return withDeadline(async (deadline) => {
      const signal = AbortSignal.any([deadline, ...(init.signal ? [init.signal] : [])]);
      signal.throwIfAborted();
      const response = await abortable(fetchImpl(input, { ...init, signal }), signal);
      const body: unknown = await abortable(response.json(), signal);
      return { response, body };
    }, timeout);
  }
  return {
    async loadProfiles(signal) {
      const { response, body: payload } = await request("/api/profiles", {
        cache: "no-store",
        signal,
      }, readTimeoutMs);
      const body = payload as {
        profiles?: HealthProfileSummary[];
      };
      if (!response.ok || !body || !Array.isArray(body.profiles)) {
        throw new Error("Profiles unavailable");
      }
      return body.profiles;
    },

    async loadHealthProfile(profile, window, signal) {
      const { start, end } = window;
      const { response, body } = await request(
        `/api/health?profile=${profile.profile.slug}&start=${start}&end=${end}`,
        {
          signal,
          cache: "no-store",
        },
        readTimeoutMs,
      );
      const payload = body as HealthResponse;
      if (!response.ok || !payload || !Array.isArray(payload.records)) {
        throw new Error(`${profile.profile.displayName} could not be loaded`);
      }
      if (
        payload.profile?.id !== profile.profile.id ||
        payload.profile.slug !== profile.profile.slug
      ) {
        throw new Error(
          `${profile.profile.displayName} returned a mismatched profile`,
        );
      }
      return payload;
    },

    async requestProfileRefresh(profileId, timeZone, force = false) {
      const { response, body } = await request("/api/oura/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          timeZone,
          ...(force ? { force: true } : {}),
        }),
        cache: "no-store",
      }, refreshTimeoutMs);
      const payload = body as Partial<ProfileRefreshResult>;
      if (
        !payload || (!response.ok && payload.status !== "failed") ||
        payload.profileId !== profileId ||
        !["fresh", "refreshed", "already_running", "failed"].includes(payload.status ?? "") ||
        !(payload.lastSucceededAt === null || (typeof payload.lastSucceededAt === "string" && Number.isFinite(Date.parse(payload.lastSucceededAt)))) ||
        !(payload.safeErrorCode === null || SAFE_REFRESH_ERROR_CODES.some((code) => code === payload.safeErrorCode))
      ) {
        throw new Error("Refresh unavailable");
      }
      return payload as ProfileRefreshResult;
    },
  };
}
