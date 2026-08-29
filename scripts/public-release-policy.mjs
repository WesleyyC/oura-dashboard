import path from "node:path";

const EXCLUDED_FILES = new Set([
  ".openai/hosting.json",
  "docs/health-refresh.md",
  "scripts/collect-health-snapshot.mjs",
  "scripts/validate-health-snapshot.mjs",
  "tests/features/health-data/health-snapshot.test.mjs",
  "tests/features/oura-connection/collect-health-snapshot.test.mjs",
]);

const EXCLUDED_PREFIXES = [
  "docs/superpowers/",
];

export function isPublicReleasePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/")
  ) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized === ".git" ||
    normalized.startsWith(".git/")
  ) {
    return false;
  }
  if (EXCLUDED_FILES.has(normalized)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function selectPublicReleaseFiles(files) {
  return [...new Set(files)]
    .filter(isPublicReleasePath)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
