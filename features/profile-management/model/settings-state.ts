import type {
  HealthProfileSummary,
  SafeRefreshErrorCode,
} from "../domain/contracts";

export interface ConfigurationStatus {
  ouraClientId: boolean;
  ouraClientSecret: boolean;
  tokenEncryptionKey: boolean;
}

export interface Notice {
  tone: "success" | "error" | "neutral";
  text: string;
}

export const CONNECTION_LABELS: Record<HealthProfileSummary["status"], string> = {
  pending: "Not connected",
  connected: "Connected",
  reauthorization_required: "Reconnect required",
  disabled: "Paused",
};

export const REFRESH_ERROR_LABELS: Record<SafeRefreshErrorCode, string> = {
  authorization_required: "Oura needs to be reconnected",
  configuration_missing: "Oura application setup is incomplete",
  oura_unavailable: "Oura is temporarily unavailable",
  rate_limited: "Oura asked us to try again later",
  storage_failed: "The refreshed data could not be saved",
  refresh_interrupted: "Refresh was interrupted. Your saved data is safe; try again.",
  unexpected: "This profile could not be refreshed",
};

export function callbackNotice(status: string): Notice {
  switch (status) {
    case "connected":
      return {
        tone: "success",
        text: "Oura connected. You can refresh this profile now.",
      };
    case "denied":
      return {
        tone: "neutral",
        text: "Oura connection was canceled.",
      };
    case "setup_required":
      return {
        tone: "error",
        text: "Oura application setup is required in Sites Settings.",
      };
    case "invalid_state":
    case "callback_invalid":
      return {
        tone: "error",
        text: "That Oura connection link expired. Start again.",
      };
    default:
      return {
        tone: "error",
        text: "Oura could not be connected. Try again.",
      };
  }
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "previously";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
