import {
  parseProfileDisplayName,
  parseProfileId,
} from "@/features/profile-management/client";
import type { OuraConnectionTarget } from "./public-contracts";
import { ConnectionInviteError } from "../server/invite-service";

export function parseOuraConnectionTarget(
  input: unknown,
): OuraConnectionTarget {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Authorization request must be an object");
  }
  const value = input as Record<string, unknown>;
  if (value.mode === "add") {
    if (
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "displayName")
    ) {
      throw new Error("Unknown add authorization field");
    }
    return {
      mode: "add",
      displayName: parseProfileDisplayName(value.displayName),
    };
  }
  if (value.mode === "reconnect") {
    if (
      Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "profileId")
    ) {
      throw new Error("Unknown reconnect authorization field");
    }
    return {
      mode: "reconnect",
      profileId: parseProfileId(value.profileId),
    };
  }
  throw new Error("mode must be add or reconnect");
}

export function parseGuestInvite(input: unknown): { invite: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ConnectionInviteError();
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 1 ||
    typeof value.invite !== "string" ||
    !value.invite ||
    value.invite.length > 256
  ) {
    throw new ConnectionInviteError();
  }
  return { invite: value.invite };
}
