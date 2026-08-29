import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("agent adapters defer to one canonical worktree policy", async () => {
  const agents = await read("AGENTS.md");
  assert.match(agents, /Every tracked change/);
  assert.match(agents, /integration-only/);
  assert.match(agents, /\.worktrees\/<topic>/);
  assert.match(agents, /scripts\/agents\/status\.mjs/);

  for (const path of [
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
  ]) {
    const adapter = await read(path);
    assert.match(adapter, /AGENTS\.md/);
    assert.ok(adapter.length < 800, `${path} duplicates canonical policy`);
  }
});

test("active agent guides are path-independent and complete", async () => {
  const paths = [
    "docs/agents/README.md",
    "docs/agents/architecture.md",
    "docs/agents/feature-map.md",
    "docs/agents/worktrees.md",
    "docs/agents/testing.md",
    "docs/agents/releasing.md",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.doesNotMatch(source, /\/Users\/|Dropbox\/Project\/Health/);
  }
  assert.match(await read("docs/agents/worktrees.md"), /git worktree repair/);
  assert.match(await read("docs/agents/releasing.md"), /codex-release\.lock/);
});
