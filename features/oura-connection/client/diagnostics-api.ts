import { SAFE_REFRESH_ERROR_CODES, type SafeRefreshErrorCode } from "@/features/profile-management/client";
import { abortable, withDeadline } from "@/shared/abortable";
import type { RefreshDiagnostic, RefreshDiagnostics } from "../domain/diagnostics";
import type { ProfileRefreshResult } from "../domain/public-contracts";

export interface DiagnosticsApi {
  load(signal?: AbortSignal): Promise<RefreshDiagnostics>;
  repair(profileId: string, timeZone: string, signal?: AbortSignal): Promise<ProfileRefreshResult>;
}

export function createDiagnosticsApi(fetchImpl: typeof fetch = fetch): DiagnosticsApi {
  async function request(path: string, init: RequestInit, timeout: number, signal?: AbortSignal): Promise<{ ok: boolean; body: unknown }> {
    return withDeadline(async (deadline) => {
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      const response = await abortable(fetchImpl(path, { ...init, signal: combined, cache: "no-store" }), combined);
      return { ok: response.ok, body: await abortable(response.json(), combined) };
    }, timeout);
  }
  return {
    async load(signal) {
      const response = await request("/api/oura/diagnostics", {}, 15_000, signal);
      const report = response.body as RefreshDiagnostics | null;
      if (!response.ok || !report || !validTimestamp(report.checkedAt) || !Array.isArray(report.profiles) || report.profiles.length > 100 ||
        report.profiles.some((row) => !validDiagnostic(row))) throw new Error("Sync status unavailable");
      return report;
    },
    async repair(profileId, timeZone, signal) {
      const response = await request("/api/oura/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, timeZone, repairHistory: true }),
      }, 270_000, signal);
      const result = response.body as ProfileRefreshResult | null;
      if (!result || (!response.ok && result.status !== "failed") || result.profileId !== profileId ||
        !["refreshed", "fresh", "already_running", "failed"].includes(result.status) ||
        !safeError(result.safeErrorCode)) throw new Error("Repair result unavailable");
      return result;
    },
  };
}

function validDiagnostic(row: RefreshDiagnostic): boolean {
  return Boolean(row && typeof row.profileId === "string" &&
    ["idle", "refreshing", "interrupted", "succeeded", "failed"].includes(row.status) &&
    (row.lastAttemptAt === null || validTimestamp(row.lastAttemptAt)) &&
    (row.lastSucceededAt === null || validTimestamp(row.lastSucceededAt)) &&
    (row.durationMs === null || Number.isFinite(row.durationMs) && row.durationMs >= 0) &&
    Number.isSafeInteger(row.lastSuccessfulRowCount) && row.lastSuccessfulRowCount >= 0 && safeError(row.safeErrorCode));
}
function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function safeError(value: unknown): boolean {
  return value === null || SAFE_REFRESH_ERROR_CODES.includes(value as SafeRefreshErrorCode);
}
