import type {
  OuraConnectionTarget,
  ProfileRefreshResult,
} from "@/features/oura-connection/client";
import type {
  HealthProfileSummary,
  ProfileUpdate,
} from "../domain/contracts";
import type { ConfigurationStatus } from "../model/settings-state";

export interface InviteResponse {
  profile: HealthProfileSummary;
  handoff: { connectUrl: string; expiresAt: string };
}

export interface SettingsApi {
  loadAccount(): Promise<{ configured: ConfigurationStatus }>;
  loadProfiles(): Promise<{ profiles: HealthProfileSummary[] }>;
  startAuthorization(
    input: OuraConnectionTarget,
  ): Promise<{ authorizationUrl: string }>;
  createInvite(input: OuraConnectionTarget): Promise<InviteResponse>;
  cancelInvite(profileId: string): Promise<void>;
  updateProfile(
    input: ProfileUpdate,
  ): Promise<{ profile: HealthProfileSummary }>;
  removeProfile(profileId: string): Promise<void>;
  refreshProfile(
    profileId: string,
    timeZone: string,
  ): Promise<ProfileRefreshResult>;
  deleteAccount(): Promise<void>;
}

export function createSettingsApi(fetchImpl: typeof fetch = fetch): SettingsApi {
  async function request<T = unknown>(
    input: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetchImpl(input, { ...init, cache: "no-store" });
    let body: unknown = null;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    if (!response.ok) {
      throw new Error(safeApiError(body));
    }
    return body as T;
  }

  return {
    loadAccount: () => request("/api/account"),
    loadProfiles: () => request("/api/profiles"),
    startAuthorization: (input) => request("/api/oura/authorize", jsonRequest("POST", input)),
    createInvite: (input) => request("/api/oura/invites", jsonRequest("POST", input)),
    async cancelInvite(profileId) {
      await request("/api/oura/invites", jsonRequest("DELETE", { profileId }));
    },
    updateProfile: (input) => request("/api/profiles", jsonRequest("PATCH", input)),
    async removeProfile(profileId) {
      await request(
        `/api/profiles?profile_id=${encodeURIComponent(profileId)}`,
        { method: "DELETE" },
      );
    },
    refreshProfile: (profileId, timeZone) => request(
      "/api/oura/refresh",
      jsonRequest("POST", { profileId, timeZone, force: true }),
    ),
    async deleteAccount() {
      await request(
        "/api/account",
        jsonRequest("DELETE", { confirmation: "DELETE" }),
      );
    },
  };
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function safeApiError(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return "Request failed";
}
