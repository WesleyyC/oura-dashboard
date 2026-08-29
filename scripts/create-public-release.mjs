#!/usr/bin/env node

import { chmod, copyFile, lstat, mkdir, readlink, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditPublicFiles,
  listTrackedFiles,
  loadDenylist,
} from "./audit-public-release.mjs";
import {
  isPublicReleasePath,
  selectPublicReleaseFiles,
} from "./public-release-policy.mjs";

export async function exportPublicFiles({
  root,
  output,
  files,
  denylistEntries = [],
}) {
  const rootPath = path.resolve(root);
  const outputPath = path.resolve(output);
  if (outputPath === rootPath || isInside(rootPath, outputPath)) {
    throw new Error("Public export target must be outside the source repository");
  }

  try {
    const entries = await readdir(outputPath);
    if (entries.length) throw new Error("Public export target must be empty");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(outputPath, { recursive: true });
  }

  const selectedFiles = selectPublicReleaseFiles(files);
  const issues = await auditPublicFiles({
    root: rootPath,
    files: selectedFiles,
    denylistEntries,
  });
  if (issues.length) {
    const categories = [...new Set(issues.map(({ category }) => category))].sort();
    throw new Error(`Public audit failed: ${categories.join(", ")}`);
  }

  const selectedSet = new Set(selectedFiles);
  for (const file of selectedFiles) {
    const source = path.resolve(rootPath, file);
    const destination = path.resolve(outputPath, file);
    if (!isInside(rootPath, source) || !isInside(outputPath, destination)) {
      throw new Error("Public export path escaped its boundary");
    }
    const metadata = await lstat(source);
    await mkdir(path.dirname(destination), { recursive: true });
    if (metadata.isSymbolicLink()) {
      const target = await readlink(source);
      const resolvedTarget = path.resolve(path.dirname(source), target);
      const relativeTarget = path.relative(rootPath, resolvedTarget).split(path.sep).join("/");
      if (
        !isInside(rootPath, resolvedTarget) ||
        !isPublicReleasePath(relativeTarget) ||
        !selectedSet.has(relativeTarget)
      ) {
        throw new Error("Public symlink target is outside the selected release");
      }
      await symlink(target, destination);
      continue;
    }
    if (!metadata.isFile()) throw new Error("Public release contains an unsupported file type");
    await copyFile(source, destination);
    await chmod(destination, metadata.mode & 0o777);
  }
  return { filesCopied: selectedFiles.length };
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const output = option("--output");
  if (!output) throw new Error("Usage: npm run release:export -- --output PATH [--denylist PATH]");
  const root = process.cwd();
  const files = await listTrackedFiles(root);
  const denylistEntries = await loadDenylist(option("--denylist"));
  const result = await exportPublicFiles({ root, output, files, denylistEntries });
  process.stdout.write(`Exported ${result.filesCopied} public file(s).\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Public export failed"}\n`);
    process.exitCode = 1;
  });
}
