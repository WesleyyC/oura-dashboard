import type { ProfileSlug, ProfileUpdate } from "./contracts";
import { parseProfileColorKey } from "./profile-colors";

const PROFILE_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/;
const MAX_PROFILE_NAME_LENGTH = 80;

export function parseProfileDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("displayName must be a string");
  }
  const displayName = value.trim().replace(/\s+/g, " ");
  if (!displayName) throw new Error("displayName must not be empty");
  if (displayName.length > MAX_PROFILE_NAME_LENGTH) {
    throw new Error(`displayName must not exceed ${MAX_PROFILE_NAME_LENGTH} characters`);
  }
  if (/[\u0000-\u001f\u007f]/.test(displayName)) {
    throw new Error("displayName contains unsupported characters");
  }
  return displayName;
}

export function normalizeProfileSlug(value: string): ProfileSlug {
  const displayName = parseProfileDisplayName(value);
  const normalized = displayName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return (
    !normalized || normalized === "family"
      ? "family-member"
      : normalized
  ) as ProfileSlug;
}

export function parseProfileId(value: unknown): string {
  if (typeof value !== "string" || !PROFILE_ID_PATTERN.test(value)) {
    throw new Error("profileId is invalid");
  }
  return value;
}

export function parseProfileCreatePayload(input: unknown): { displayName: string } {
  const payload = parseExactObject(input, ["displayName"], "profile payload");
  return { displayName: parseProfileDisplayName(payload.displayName) };
}

export function parseProfileUpdatePayload(input: unknown): ProfileUpdate {
  const payload = parseExactObject(
    input,
    ["profileId", "displayName", "colorKey", "sortOrder", "disabled"],
    "profile update",
  );
  const profileId = parseProfileId(payload.profileId);
  const update: ProfileUpdate = { profileId };

  if ("displayName" in payload) {
    update.displayName = parseProfileDisplayName(payload.displayName);
  }
  if ("colorKey" in payload) {
    update.colorKey = parseProfileColorKey(payload.colorKey);
  }
  if ("sortOrder" in payload) {
    if (
      typeof payload.sortOrder !== "number" ||
      !Number.isInteger(payload.sortOrder) ||
      payload.sortOrder < 0 ||
      payload.sortOrder > 10_000
    ) {
      throw new Error("sortOrder must be an integer from 0 through 10000");
    }
    update.sortOrder = payload.sortOrder;
  }
  if ("disabled" in payload) {
    if (typeof payload.disabled !== "boolean") {
      throw new Error("disabled must be a boolean");
    }
    update.disabled = payload.disabled;
  }
  if (Object.keys(update).length === 1) {
    throw new Error("profile update must include a change");
  }
  return update;
}

function parseExactObject(
  input: unknown,
  allowedFields: string[],
  label: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  const payload = input as Record<string, unknown>;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(payload).find((field) => !allowed.has(field));
  if (unknown) throw new Error(`Unknown ${label} field: ${unknown}`);
  return payload;
}
