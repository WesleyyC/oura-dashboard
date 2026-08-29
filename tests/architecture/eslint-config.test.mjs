import assert from "node:assert/strict";
import test from "node:test";

import { ESLint } from "eslint";

test("root ESLint configuration ignores linked worktree contents", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  assert.equal(
    await eslint.isPathIgnored(".worktrees/example/app/page.tsx"),
    true,
  );
});
