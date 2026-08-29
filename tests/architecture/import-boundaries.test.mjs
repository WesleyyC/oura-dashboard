import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkArchitecture,
  checkImport,
} from "../../scripts/agents/check-architecture.mjs";
import { createGitFixture } from "../scripts/agents/git-fixture.mjs";

test("architecture rules reject inverted and internal dependencies", () => {
  assert.deepEqual(
    checkImport("platform/auth/server.ts", "@/features/dashboard/server"),
    { code: "platform_depends_on_feature" },
  );
  assert.deepEqual(
    checkImport("shared/ui/Button.tsx", "@/platform/runtime/server"),
    { code: "shared_depends_on_platform" },
  );
  assert.deepEqual(
    checkImport(
      "features/dashboard/model/state.ts",
      "@/features/health-data/domain/analysis",
    ),
    { code: "cross_feature_internal_import" },
  );
  assert.deepEqual(
    checkImport(
      "features/dashboard/model/state.ts",
      "@/features/health-data/client/private",
    ),
    { code: "cross_feature_internal_import" },
  );
  assert.deepEqual(
    checkImport(
      "features/dashboard/client.ts",
      "@/features/dashboard/server/repository",
    ),
    { code: "client_reaches_server" },
  );
  assert.deepEqual(
    checkImport(
      "features/dashboard/components/DashboardScreen.tsx",
      "@/features/dashboard/server/repository",
    ),
    { code: "client_reaches_server" },
  );
  assert.deepEqual(
    checkImport(
      "features/profile-management/model/settings-state.ts",
      "@/platform/database/server",
    ),
    { code: "client_reaches_server" },
  );
  assert.equal(
    checkImport("app/page.tsx", "@/features/dashboard/client"),
    null,
  );
  assert.equal(
    checkImport("app/api/health/route.ts", "@/features/health-data/server"),
    null,
  );
  assert.deepEqual(
    checkImport(
      "app/page.tsx",
      "@/features/dashboard/components/DashboardScreen",
    ),
    { code: "app_reaches_feature_internal" },
  );
  assert.equal(
    checkImport(
      "features/dashboard/model/state.ts",
      "@/features/dashboard/presentation/health-ui",
    ),
    null,
  );
  assert.equal(
    checkImport("app/api/health/route.ts", "@/legacy/health/store"),
    null,
    "legacy roots stay outside the managed graph during migration",
  );
});

test("scanner reports imports and active absolute paths but ignores history", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "oura-architecture-test-"));
  const absoluteExample = ["", "Users", "example", "project"].join("/");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "platform/auth"), { recursive: true });
  await mkdir(join(root, "features/dashboard"), { recursive: true });
  await mkdir(join(root, "docs/agents"), { recursive: true });
  await mkdir(join(root, "docs/superpowers/plans"), { recursive: true });
  await writeFile(
    join(root, "platform/auth/server.ts"),
    'export { Dashboard } from "@/features/dashboard/client";\n',
  );
  await writeFile(join(root, "features/dashboard/client.ts"), "export {};\n");
  await writeFile(
    join(root, "docs/agents/README.md"),
    `Use ${absoluteExample} directly.\n`,
  );
  await writeFile(
    join(root, "docs/superpowers/plans/history.md"),
    `Historical ${absoluteExample} path.\n`,
  );

  const diagnostics = await checkArchitecture({ root, trackedOnly: false });
  assert.deepEqual(
    diagnostics.map(({ path, code }) => ({ path, code })),
    [
      {
        path: "docs/agents/README.md",
        code: "absolute_checkout_path",
      },
      {
        path: "platform/auth/server.ts",
        code: "platform_depends_on_feature",
      },
    ],
  );
});

test("scanner ignores tracked files deleted in the working tree", async (t) => {
  const fixture = await createGitFixture(t);
  await fixture.commitFile(
    "platform/auth/server.ts",
    "export const active = true;\n",
  );
  await unlink(join(fixture.root, "platform/auth/server.ts"));

  assert.deepEqual(await checkArchitecture({ root: fixture.root }), []);
});
