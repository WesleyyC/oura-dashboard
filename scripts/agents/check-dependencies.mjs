import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function supports(values, current) {
  if (!values) return true;
  if (values.includes(`!${current}`)) return false;
  return !values.some((value) => !value.startsWith("!")) || values.includes(current);
}

function hostPackages(packages) {
  const libc = process.platform === "linux"
    ? process.report.getReport().header.glibcVersionRuntime ? "glibc" : "musl" : null;
  return new Set(Object.entries(packages).filter(([, entry]) =>
    supports(entry.os, process.platform) && supports(entry.cpu, process.arch) &&
    (!libc || supports(entry.libc, libc)),
  ).map(([path]) => path));
}

function reachablePackages(packages, compatible) {
  const reached = new Set();
  function visit(path) {
    if (reached.has(path) || !compatible.has(path)) return;
    reached.add(path);
    const entry = packages[path];
    const dependencies = { ...entry.dependencies, ...entry.optionalDependencies,
      ...entry.peerDependencies, ...(path === "" ? entry.devDependencies : {}) };
    for (const name of Object.keys(dependencies)) {
      // Follow npm's nested/hoisted resolution, retaining the exact lock path.
      let parent = path;
      while (true) {
        const candidate = `${parent ? `${parent}/` : ""}node_modules/${name}`;
        if (packages[candidate]) { visit(candidate); break; }
        if (!parent) break;
        const separator = parent.lastIndexOf("/node_modules/");
        parent = separator < 0 ? "" : parent.slice(0, separator);
      }
    }
  }
  visit("");
  return reached;
}

// Check the actual installation, not merely two identical manifests. Missing
// foreign-platform packages and their exclusive optional children are expected;
// host-reachable packages remain required, even when marked optional by npm.
export async function inspectDependencies(root) {
  const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  if (!lock.packages || ![2, 3].includes(lock.lockfileVersion)) {
    return { valid: false, checked: 0, mismatches: ["unsupported lockfile"] };
  }
  const compatible = hostPackages(lock.packages);
  const reachable = reachablePackages(lock.packages, compatible);
  let checked = 0;
  const mismatches = [];
  for (const [packagePath, entry] of Object.entries(lock.packages)) {
    if (!packagePath) continue;
    if (!packagePath.startsWith("node_modules/") || packagePath.includes("..") || entry.link) {
      mismatches.push("unsupported package layout");
      continue;
    }
    if (!compatible.has(packagePath)) continue;
    const installed = await readFile(resolve(root, packagePath, "package.json"), "utf8")
      .then((source) => JSON.parse(source)).catch((error) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
    if (installed === undefined && entry.optional && !reachable.has(packagePath)) continue;
    checked += 1;
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
