import { readdir, readFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeInstructionPaths,
  architectureRules,
} from "./architecture.config.mjs";
import { runGit } from "./lib/git.mjs";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs"]);

export function checkImport(sourcePath, specifier) {
  const source = normalizePath(sourcePath);
  const target = resolveSpecifier(source, specifier);
  if (!target) return null;
  const sourceParts = source.split("/");
  const [sourceRoot, sourceFeature, sourceBoundary] = sourceParts;
  const [targetRoot, targetFeature] = target.split("/");
  const browserFeatureSource =
    sourceRoot === "features" &&
    (
      posix.basename(source).replace(/\.[^.]+$/, "") === "client" ||
      ["client", "components", "model", "presentation"].includes(sourceBoundary)
    );

  if (
    browserFeatureSource &&
    (targetRoot === "platform" || target.split("/").includes("server"))
  ) {
    return { code: "client_reaches_server" };
  }
  if (sourceRoot === "platform" && targetRoot === "features") {
    return { code: "platform_depends_on_feature" };
  }
  if (sourceRoot === "shared" && targetRoot === "platform") {
    return { code: "shared_depends_on_platform" };
  }
  if (sourceRoot === "shared" && targetRoot === "features") {
    return { code: "shared_depends_on_feature" };
  }
  if (
    sourceRoot === "app" &&
    targetRoot === "features" &&
    !isFeatureEntrypoint(target)
  ) {
    return { code: "app_reaches_feature_internal" };
  }
  if (
    sourceRoot === "features" &&
    targetRoot === "features" &&
    sourceFeature !== targetFeature &&
    !isFeatureEntrypoint(target)
  ) {
    return { code: "cross_feature_internal_import" };
  }
  const rule = architectureRules[sourceRoot];
  if (
    rule &&
    Object.hasOwn(architectureRules, targetRoot) &&
    !rule.mayImport.includes(targetRoot)
  ) {
    return { code: `${sourceRoot}_dependency_not_allowed` };
  }
  return null;
}

function isFeatureEntrypoint(path) {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    /^(?:client|server)(?:\.(?:ts|tsx|mts|mjs|js|jsx))?$/.test(parts[2])
  );
}

export async function checkArchitecture({
  root = process.cwd(),
  trackedOnly = true,
} = {}) {
  const files = trackedOnly
    ? trackedFiles(root)
    : await recursiveFiles(root);
  const diagnostics = [];
  for (const path of files.sort()) {
    const normalized = normalizePath(path);
    const activeInstruction = isActiveInstruction(normalized);
    const sourceFile = SOURCE_EXTENSIONS.has(posix.extname(normalized));
    if (!activeInstruction && !sourceFile) continue;
    let source;
    try {
      source = await readFile(join(root, path), "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    if (activeInstruction) {
      const match = /\/Users\/|Dropbox\/Project\/Health/.exec(source);
      if (match) {
        diagnostics.push({
          path: normalized,
          line: lineNumber(source, match.index),
          code: "absolute_checkout_path",
        });
      }
    }
    if (!sourceFile) continue;
    for (const item of importsIn(source)) {
      const diagnostic = checkImport(normalized, item.specifier);
      if (diagnostic) {
        diagnostics.push({
          path: normalized,
          line: item.line,
          code: diagnostic.code,
        });
      }
    }
  }
  return diagnostics.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.code.localeCompare(right.code)
  );
}

function trackedFiles(root) {
  const output = runGit(
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root },
  ).stdout;
  return output ? output.split("\n").filter(Boolean) : [];
}

async function recursiveFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await recursiveFiles(root, absolute));
    if (entry.isFile()) files.push(relative(root, absolute));
  }
  return files;
}

function importsIn(source) {
  const imports = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push({ specifier: match[1], line: lineNumber(source, match.index) });
    }
  }
  return imports;
}

function resolveSpecifier(source, specifier) {
  if (specifier.startsWith("@/")) return normalizePath(specifier.slice(2));
  if (specifier.startsWith(".")) {
    return normalizePath(posix.normalize(posix.join(dirname(source), specifier)));
  }
  return null;
}

function isActiveInstruction(path) {
  return activeInstructionPaths.some(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`),
  );
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

async function main() {
  const diagnostics = await checkArchitecture();
  if (!diagnostics.length) {
    process.stdout.write("Architecture boundaries pass\n");
    return;
  }
  for (const item of diagnostics) {
    process.stderr.write(`${item.path}:${item.line} ${item.code}\n`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
