export const PROFILE_COLOR_PALETTE = [
  { key: "ocean", label: "Ocean blue", cssVariable: "--profile-ocean" },
  { key: "berry", label: "Berry", cssVariable: "--profile-berry" },
  { key: "meadow", label: "Meadow green", cssVariable: "--profile-meadow" },
  { key: "sunset", label: "Sunset amber", cssVariable: "--profile-sunset" },
  { key: "iris", label: "Iris violet", cssVariable: "--profile-iris" },
  { key: "lagoon", label: "Lagoon teal", cssVariable: "--profile-lagoon" },
] as const;

export type ProfileColorKey =
  (typeof PROFILE_COLOR_PALETTE)[number]["key"];

export function parseProfileColorKey(value: unknown): ProfileColorKey {
  const match = PROFILE_COLOR_PALETTE.find(({ key }) => key === value);
  if (!match) {
    throw new Error("colorKey must be a curated profile color");
  }
  return match.key;
}

export function resolveProfileColorKey(
  value: unknown,
  profileId: string,
): ProfileColorKey {
  const stored = PROFILE_COLOR_PALETTE.find(({ key }) => key === value);
  if (stored) return stored.key;

  let hash = 2_166_136_261;
  for (const character of profileId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return PROFILE_COLOR_PALETTE[
    (hash >>> 0) % PROFILE_COLOR_PALETTE.length
  ].key;
}

export function nextProfileColorKey(
  used: Iterable<ProfileColorKey>,
  fallbackIndex: number,
): ProfileColorKey {
  const assigned = new Set(used);
  return (
    PROFILE_COLOR_PALETTE.find(({ key }) => !assigned.has(key))?.key ??
    PROFILE_COLOR_PALETTE[
      Math.max(0, Math.floor(fallbackIndex)) % PROFILE_COLOR_PALETTE.length
    ].key
  );
}

export function profileColorCssValue(key: ProfileColorKey): string {
  const color = PROFILE_COLOR_PALETTE.find((item) => item.key === key);
  return `var(${color?.cssVariable ?? "--profile-ocean"})`;
}
