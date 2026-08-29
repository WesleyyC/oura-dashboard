export const DEFAULT_TIME_ZONE = "America/New_York";

const MAX_TIME_ZONE_LENGTH = 100;

export function isValidTimeZone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TIME_ZONE_LENGTH ||
    value !== value.trim() ||
    value.includes(":") ||
    value.startsWith("+") ||
    value.startsWith("-")
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: unknown): string {
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

export function resolveLocalTimeZone(
  resolve: () => unknown = () =>
    new Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    return normalizeTimeZone(resolve());
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
