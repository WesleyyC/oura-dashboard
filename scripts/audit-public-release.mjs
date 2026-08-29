#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { selectPublicReleaseFiles } from "./public-release-policy.mjs";

const execFile = promisify(execFileCallback);
const EXAMPLE_EMAIL_DOMAINS = ["example.com", "example.net", "example.org"];
const RESERVED_EMAIL_SUFFIXES = [".invalid", ".localhost", ".test"];
const OPERATOR_CONFIG_PATHS = new Set([
  ".openai/hosting.json",
  ".dev.vars",
  "wrangler.jsonc",
]);
const SENSITIVE_ASSIGNMENT_KEYS = [
  "OURA_CLIENT_ID",
  "OURA_CLIENT_SECRET",
  "OURA_TOKEN_ENCRYPTION_KEY",
  "SECURITY_RATE_LIMIT_KEY",
  "OWNER_EMAIL_ALLOWLIST",
  "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "CLOUDFLARE_ACCESS_AUD",
];

export async function auditPublicFiles({
  root,
  files,
  denylistEntries = [],
}) {
  const issues = [];
  const normalizedDenylist = denylistEntries
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("#"))
    .map((entry) => entry.toLocaleLowerCase("en-US"));

  for (const file of [...new Set(files)].sort()) {
    const categories = new Set();
    const pathCategory = unsafePathCategory(file);
    if (pathCategory) categories.add(pathCategory);
    const lowerPath = file.toLocaleLowerCase("en-US");
    const denylistedPath = normalizedDenylist.some((entry) => lowerPath.includes(entry));
    if (denylistedPath) {
      categories.add("private-denylist");
    }
    if (isPrivateArtifactPath(file)) categories.add("private-artifact");
    if (pathCategory) {
      appendIssues(issues, denylistedPath ? "[redacted]" : file, categories);
      continue;
    }

    const absolutePath = path.resolve(root, file);
    if (!isInside(root, absolutePath)) {
      issues.push({ path: file, category: "unsafe-path" });
      continue;
    }

    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch {
      issues.push({ path: file, category: "unreadable-file" });
      continue;
    }

    if (metadata.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      const lowerTarget = target.toLocaleLowerCase("en-US");
      if (normalizedDenylist.some((entry) => lowerTarget.includes(entry))) {
        categories.add("private-denylist");
      }
      const resolvedTarget = path.resolve(path.dirname(absolutePath), target);
      if (!isInside(root, resolvedTarget)) {
        categories.add("unsafe-symlink");
      }
      appendIssues(issues, denylistedPath ? "[redacted]" : file, categories);
      continue;
    }
    if (!metadata.isFile()) {
      issues.push({ path: file, category: "unsupported-file-type" });
      continue;
    }

    const source = await readFile(absolutePath);
    const searchable = searchableFileContent(source);
    const lowerSource = searchable.toLocaleLowerCase("en-US");

    if (/\/Users\/[A-Za-z0-9._-]+\//.test(searchable) || /[A-Za-z]:\\Users\\[^\\\s]+\\/i.test(searchable)) {
      categories.add("absolute-local-path");
    }
    for (const match of searchable.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
      const domain = match[1].toLocaleLowerCase("en-US");
      if (!isSafeExampleEmailDomain(domain) && domain !== "users.noreply.github.com") {
        categories.add("non-example-email");
      }
    }
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(searchable) ||
      /\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,})\b/.test(searchable) ||
      /\boura_personal_access_token_[A-Za-z0-9_-]{20,}\b/i.test(searchable) ||
      /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/i.test(searchable)
    ) {
      categories.add("credential-pattern");
    }
    if (
      /\bappgprj_[A-Za-z0-9]{12,}\b/.test(searchable) ||
      /["'](?:project_id|account_id|database_id)["']\s*:\s*["'](?!0{8}-0{4}-4000-8000-0{12}|REPLACE_)[^"']+["']/i.test(searchable)
    ) {
      categories.add("production-resource-id");
    }
    if (normalizedDenylist.some((entry) => lowerSource.includes(entry))) {
      categories.add("private-denylist");
    }
    if (hasSensitiveAssignment(searchable)) {
      categories.add("sensitive-assignment");
    }

    appendIssues(issues, denylistedPath ? "[redacted]" : file, categories);
  }
  return issues;
}

function appendIssues(issues, file, categories) {
  for (const category of [...categories].sort()) {
    issues.push({ path: file, category });
  }
}

function hasSensitiveAssignment(source) {
  const keys = SENSITIVE_ASSIGNMENT_KEYS.join("|");
  const assignment = new RegExp(
    `(?:^|[\\n,{])[ \\t]*(?:export[ \\t]+)?["']?(?:${keys})["']?[ \\t]*(?:=|:)[ \\t]*([^\\n,}]+)`,
    "gm",
  );
  for (const match of source.matchAll(assignment)) {
    if (!isSafeAssignmentValue(match[1])) return true;
  }
  return false;
}

function isSafeAssignmentValue(rawValue) {
  const raw = rawValue.trim().replace(/;[ \t]*(?:\/\/.*)?$/, "").trim();
  if (!raw || raw === "null" || raw === "undefined" || raw === '""' || raw === "''") {
    return true;
  }
  const quoted = raw.match(/^(["'])(.*)\1$/s);
  const value = quoted ? quoted[2] : raw;
  return (
    value.startsWith("REPLACE_") ||
    value === "team-name.cloudflareaccess.com" ||
    value === "sample-team.cloudflareaccess.com" ||
    /^[^@\s]+@(?:example\.(?:com|net|org)|[^@\s]+\.(?:invalid|localhost|test))$/i.test(value)
  );
}

function isPrivateArtifactPath(file) {
  const normalized = file.toLocaleLowerCase("en-US");
  if (
    ["work/", "dist/", ".next/", ".wrangler/", "node_modules/", "coverage/"]
      .some((prefix) => normalized.startsWith(prefix))
  ) {
    return true;
  }
  if (/(?:^|\/)health-snapshot(?:[.-]|$)/.test(normalized)) return true;
  return /\.(?:7z|bundle|db|gz|key|log|pem|snap|sqlite|sqlite3|tar|tgz|zip)$/.test(normalized);
}

function searchableFileContent(source) {
  const pngSignature = "89504e470d0a1a0a";
  if (source.length >= 8 && source.subarray(0, 8).toString("hex") === pngSignature) {
    const metadataChunks = [];
    let offset = 8;
    while (offset + 12 <= source.length) {
      const length = source.readUInt32BE(offset);
      const type = source.toString("ascii", offset + 4, offset + 8);
      const end = offset + 12 + length;
      if (end > source.length) break;
      if (type !== "IDAT") metadataChunks.push(source.subarray(offset + 8, offset + 8 + length));
      offset = end;
      if (type === "IEND") break;
    }
    return Buffer.concat(metadataChunks).toString("latin1");
  }
  return source.toString("latin1");
}

function isSafeExampleEmailDomain(domain) {
  return EXAMPLE_EMAIL_DOMAINS.some(
    (example) => domain === example || domain.endsWith(`.${example}`),
  ) || RESERVED_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export async function listTrackedFiles(root) {
  const { stdout } = await execFile("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

export async function loadDenylist(pathValue) {
  if (!pathValue) return [];
  return (await readFile(pathValue, "utf8")).split(/\r?\n/);
}

function unsafePathCategory(file) {
  if (file === ".env.example") return null;
  if (file === ".openai/hosting.json" || OPERATOR_CONFIG_PATHS.has(file) || file.startsWith(".env")) {
    return "operator-config";
  }
  if (file === "docs/superpowers" || file.startsWith("docs/superpowers/")) {
    return "private-history";
  }
  if (path.posix.normalize(file) !== file || file.startsWith("/") || file.startsWith("../")) {
    return "unsafe-path";
  }
  return null;
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function repositoryRoot(cwd = process.cwd()) {
  const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  return stdout.trim();
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const root = await repositoryRoot();
  const files = selectPublicReleaseFiles(await listTrackedFiles(root));
  const denylistEntries = await loadDenylist(option("--denylist"));
  const issues = await auditPublicFiles({ root, files, denylistEntries });
  if (issues.length) {
    for (const issue of issues) process.stderr.write(`${issue.path}: ${issue.category}\n`);
    process.stderr.write(`Public audit failed with ${issues.length} issue(s).\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Public audit passed for ${files.length} tracked file(s).\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(() => {
    process.stderr.write("Public audit could not complete.\n");
    process.exitCode = 1;
  });
}
