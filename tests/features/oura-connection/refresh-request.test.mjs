import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL(
  "../../../features/oura-connection/domain/refresh-request.ts",
  import.meta.url,
);

async function loadRefreshRequestModule() {
  return import(moduleUrl).catch(() => ({}));
}

test("refresh requests accept one validated device timezone", async () => {
  const refreshRequest = await loadRefreshRequestModule();

  assert.deepEqual(
    refreshRequest.parseRefreshRequest?.({
      profileId: "profile-a",
      timeZone: "Asia/Shanghai",
      force: true,
    }),
    {
      profileId: "profile-a",
      timeZone: "Asia/Shanghai",
      force: true,
    },
  );
});

test("refresh requests reject malformed timezones and unknown fields", async () => {
  const refreshRequest = await loadRefreshRequestModule();

  assert.throws(
    () => refreshRequest.parseRefreshRequest?.({
      profileId: "profile-a",
      timeZone: "+08:00",
    }),
    /timezone/i,
  );
  assert.throws(
    () => refreshRequest.parseRefreshRequest?.({
      profileId: "profile-a",
      timeZone: "Asia/Shanghai",
      ownerId: "owner-a",
    }),
    /unknown/i,
  );
});

test("cached refresh clients retain the compatibility timezone", async () => {
  const refreshRequest = await loadRefreshRequestModule();

  assert.deepEqual(
    refreshRequest.parseRefreshRequest?.({ profileId: "profile-a" }),
    {
      profileId: "profile-a",
      timeZone: "America/New_York",
    },
  );
});
