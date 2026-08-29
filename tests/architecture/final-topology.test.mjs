import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

async function filesUnder(root, predicate = () => true) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && predicate(target)) files.push(target);
    }
  }
  await visit(path.join(repositoryRoot, root));
  return files.sort();
}

test("package metadata uses the repository name", async () => {
  const [packageSource, lockSource] = await Promise.all([
    readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const packageLock = JSON.parse(lockSource);
  assert.equal(packageJson.name, "oura-dashboard");
  assert.equal(packageLock.name, "oura-dashboard");
  assert.equal(packageLock.packages[""].name, "oura-dashboard");
});

test("app contains framework adapters rather than feature implementation", async () => {
  const appFiles = (await filesUnder("app", (file) => /\.(?:ts|tsx)$/.test(file)))
    .map((file) => path.relative(repositoryRoot, file).split(path.sep).join("/"));
  assert.deepEqual(appFiles, [
    "app/access-denied/page.tsx",
    "app/api/account/route.ts",
    "app/api/health/route.ts",
    "app/api/oura/authorize/route.ts",
    "app/api/oura/callback/route.ts",
    "app/api/oura/guest/authorize/route.ts",
    "app/api/oura/guest/callback/route.ts",
    "app/api/oura/guest/inspect/route.ts",
    "app/api/oura/invites/route.ts",
    "app/api/oura/refresh/route.ts",
    "app/api/profiles/route.ts",
    "app/chatgpt-auth.ts",
    "app/connect/oura/complete/page.tsx",
    "app/connect/oura/page.tsx",
    "app/layout.tsx",
    "app/manifest.ts",
    "app/page.tsx",
    "app/settings/page.tsx",
  ]);
});

test("active code and agent guides contain no legacy imports or local paths", async () => {
  const activeCode = (
    await Promise.all(
      ["app", "features", "platform", "shared", "worker", "scripts", "tests"]
        .map((root) => filesUnder(root, (file) => /\.(?:ts|tsx|mjs)$/.test(file))),
    )
  ).flat();
  for (const file of activeCode) {
    const source = await readFile(file, "utf8");
    const relativeFile = path.relative(repositoryRoot, file);
    const patterns = [
      /(?:import|export)\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+)["']/g,
      /import\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        const target = specifier.startsWith("@/")
          ? specifier.slice(2)
          : specifier.startsWith(".")
            ? path.normalize(path.join(path.dirname(relativeFile), specifier))
            : "";
        assert.notEqual(target.split(path.sep)[0], "lib", relativeFile);
      }
    }
  }

  const guideFiles = [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
    ...(
      await filesUnder("docs/agents", (file) => file.endsWith(".md"))
    ).map((file) => path.relative(repositoryRoot, file)),
  ];
  for (const file of guideFiles) {
    const source = await readFile(path.join(repositoryRoot, file), "utf8");
    assert.doesNotMatch(source, /\/Users\/|Dropbox\/Project\/Health/, file);
  }
});
