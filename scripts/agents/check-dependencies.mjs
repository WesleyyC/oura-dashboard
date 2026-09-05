import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function supports(values, current) {
  if (!values) return true;
  if (values.includes(`!${current}`)) return false;
  return !values.some((value) => !value.startsWith("!")) || values.includes(current);
}

// Check the actual installation, not merely two identical manifests. Missing
// native packages for other platforms are expected; host packages are required.
export async function inspectDependencies(root) {
  const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  if (!lock.packages || ![2, 3].includes(lock.lockfileVersion)) {
    return { valid: false, checked: 0, mismatches: ["unsupported lockfile"] };
  }
  let checked = 0;
  const mismatches = [];
  for (const [packagePath, entry] of Object.entries(lock.packages)) {
    if (!packagePath) continue;
    if (!packagePath.startsWith("node_modules/") || packagePath.includes("..") || entry.link) {
      mismatches.push("unsupported package layout");
      continue;
    }
    if (!supports(entry.os, process.platform) || !supports(entry.cpu, process.arch)) continue;
    if (process.platform === "linux" && entry.libc) {
      const libc = process.report.getReport().header.glibcVersionRuntime ? "glibc" : "musl";
      if (!supports(entry.libc, libc)) continue;
    }
    checked += 1;
    const installed = await readFile(resolve(root, packagePath, "package.json"), "utf8")
      .then((source) => JSON.parse(source)).catch(() => null);
    if (!installed || installed.version !== entry.version) mismatches.push(packagePath);
  }
  return { valid: mismatches.length === 0, checked, mismatches };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await inspectDependencies(resolve(process.argv[2] ?? "."));
    process.stdout.write(`Dependency check: ${result.valid ? "exact" : "incomplete or stale"}; ${result.checked} host packages, ${result.mismatches.length} mismatch(es).\n`);
    if (!result.valid) process.exitCode = 1;
  } catch {
    process.stderr.write("Dependency check could not complete.\n");
    process.exitCode = 1;
  }
}
