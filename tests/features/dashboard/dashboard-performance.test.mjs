import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import test from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const clientRoot = new URL("dist/client/", repositoryRoot);
const manifestUrl = new URL(".vite/manifest.json", clientRoot);
const budgetBytes = 108_485;

async function dashboardBundleClosure() {
  let manifestSource;
  try {
    manifestSource = await readFile(manifestUrl, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const manifest = JSON.parse(manifestSource);
  const roots = [
    "virtual:vinext-app-browser-entry",
    "features/dashboard/components/DashboardScreen.tsx",
  ];
  const entries = new Set();

  function visit(key) {
    if (entries.has(key) || !manifest[key]) return;
    entries.add(key);
    for (const imported of manifest[key].imports ?? []) visit(imported);
  }

  for (const root of roots) {
    assert.ok(manifest[root], `Built client manifest is missing ${root}`);
    visit(root);
  }

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const key of entries) {
    const contents = await readFile(new URL(manifest[key].file, clientRoot));
    rawBytes += contents.byteLength;
    gzipBytes += gzipSync(contents).byteLength;
  }

  return { entries: [...entries], rawBytes, gzipBytes };
}

test("dashboard synchronous JavaScript excludes management UI and stays within budget", async (t) => {
  const closure = await dashboardBundleClosure();
  if (!closure) {
    t.skip("Run the production build to enforce the dashboard bundle budget");
    return;
  }
  const managementEntries = closure.entries.filter((entry) =>
    /SettingsScreen|OuraConnectionHandoff/.test(entry)
  );

  assert.equal(
    managementEntries.length,
    0,
    `Synchronous management chunks: ${managementEntries.join(", ")}`,
  );
  assert.ok(
    closure.gzipBytes <= budgetBytes,
    `Dashboard synchronous JavaScript is ${closure.gzipBytes} gzip bytes; budget is ${budgetBytes}`,
  );
});
