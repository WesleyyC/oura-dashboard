import type { ChatGPTUser } from "./request-user.ts";

export type OwnerAccessErrorCode =
  | "owner_not_allowed"
  | "owner_allowlist_unavailable";

export class OwnerAccessError extends Error {
  constructor(
    readonly code: OwnerAccessErrorCode,
    readonly status: 403 | 503,
  ) {
    super(
      code === "owner_not_allowed"
        ? "Owner access denied"
        : "Owner access is unavailable",
    );
    this.name = "OwnerAccessError";
  }
}

export function parseOwnerEmailAllowlist(
  value: string | undefined,
): ReadonlySet<string> {
  if (typeof value !== "string") throw unavailable();

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw unavailable();

  const normalized = new Set<string>();
  for (const entry of entries) {
    const email = normalizeEmail(entry);
    if (!email) throw unavailable();
    normalized.add(email);
  }
  return normalized;
}

export function requireAllowedOwner(
  user: ChatGPTUser,
  value: string | undefined,
): ChatGPTUser {
  const allowed = parseOwnerEmailAllowlist(value);
  const email = normalizeEmail(user.email);
  if (!email || !allowed.has(email)) {
    throw new OwnerAccessError("owner_not_allowed", 403);
  }
  return user;
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || /[\s,\u0000-\u001f\u007f]/u.test(normalized)) {
    return null;
  }
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@")) return null;
  if (at === normalized.length - 1) return null;
  return normalized;
}

function unavailable(): OwnerAccessError {
  return new OwnerAccessError("owner_allowlist_unavailable", 503);
}
