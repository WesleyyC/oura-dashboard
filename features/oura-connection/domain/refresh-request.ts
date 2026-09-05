import { parseProfileId } from "@/features/profile-management/client";
import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
} from "@/shared/time-zone";

export interface RefreshRequest {
  profileId: string;
  timeZone: string;
  force?: boolean;
  repairHistory?: boolean;
}

export function parseRefreshRequest(value: unknown): RefreshRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Refresh request must be an object");
  }
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find(
    (key) => !["profileId", "timeZone", "force", "repairHistory"].includes(key),
  );
  if (unknown) throw new Error("Refresh request contains an unknown field");

  const profileId = parseProfileId(input.profileId);
  const timeZone = Object.hasOwn(input, "timeZone")
    ? input.timeZone
    : DEFAULT_TIME_ZONE;
  if (!isValidTimeZone(timeZone)) {
    throw new Error("timeZone must be a valid IANA timezone");
  }
  if ("force" in input && typeof input.force !== "boolean") {
    throw new Error("force must be a boolean");
  }
  if ("repairHistory" in input && typeof input.repairHistory !== "boolean") {
    throw new Error("repairHistory must be a boolean");
  }
  return {
    profileId,
    timeZone,
    ...("force" in input ? { force: input.force as boolean } : {}),
    ...("repairHistory" in input ? { repairHistory: input.repairHistory as boolean } : {}),
  };
}
