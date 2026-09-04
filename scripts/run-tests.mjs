import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const testsRoot = path.join(repositoryRoot, "tests");

export async function discoverTests(root = testsRoot) {
  const resolvedRoot = path.resolve(root);
  const relativeRoot = path.relative(testsRoot, resolvedRoot);
  if (
    relativeRoot === ".." ||
    relativeRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeRoot)
  ) {
    throw new Error("Test discovery root must be inside tests/");
  }

  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "work"].includes(entry.name)) continue;
        await visit(target);
      } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
        files.push(target);
      }
    }
  }
  await visit(resolvedRoot);
  return files.sort();
}

export function selectTests(files, area) {
  if (!area) return [...files];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(area)) {
    throw new Error(`Invalid test area: ${area}`);
  }
  const marker = `/${area}/`;
  const selected = files.filter((file) =>
    file.split(path.sep).join("/").includes(marker)
  );
  if (!selected.length) {
    throw new Error(`Unknown test area: ${area}`);
  }
  return selected;
}

async function main() {
  const files = selectTests(await discoverTests(), process.argv[2]);
  const child = spawn(process.execPath, [
    "--disable-warning=ExperimentalWarning",
    "--import", "tsx",
    "--test",
    ...files,
  ], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await main();
}
