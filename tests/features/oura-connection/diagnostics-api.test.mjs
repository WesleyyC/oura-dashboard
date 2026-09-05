import assert from "node:assert/strict";
import test from "node:test";
import { createDiagnosticsApi } from "../../../features/oura-connection/client/diagnostics-api.ts";

test("repair preserves an allowlisted failed envelope on HTTP 503", async () => {
  const result = { profileId: "profile-a", status: "failed", safeErrorCode: "configuration_missing", lastSucceededAt: null };
  const api = createDiagnosticsApi(async () => Response.json(result, { status: 503 }));
  assert.deepEqual(await api.repair("profile-a", "UTC"), result);
  await assert.rejects(api.load());
});

test("repair rejects mismatched or unsafe failed envelopes", async () => {
  for (const result of [
    { profileId: "profile-b", status: "failed", safeErrorCode: "unexpected" },
    { profileId: "profile-a", status: "failed", safeErrorCode: "private-upstream-detail" },
    { profileId: "profile-a", status: "refreshed", safeErrorCode: null },
  ]) {
    const api = createDiagnosticsApi(async () => Response.json(result, { status: 503 }));
    await assert.rejects(api.repair("profile-a", "UTC"));
  }
});
