import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("platform entrypoints expose infrastructure without feature imports", async () => {
  for (const area of ["auth", "database", "runtime", "security"]) {
    const source = await readFile(
      new URL(`../../platform/${area}/server.ts`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /@\/features|\.\.\/\.\.\/features/);
  }
});

test("drizzle and worker use platform entrypoints", async () => {
  assert.match(
    await readFile(new URL("../../drizzle.config.ts", import.meta.url), "utf8"),
    /platform\/database\/schema\.ts/,
  );
  const worker = await readFile(
    new URL("../../worker/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /platform\/runtime\/server/);
  assert.match(worker, /platform\/security\/server/);
});
