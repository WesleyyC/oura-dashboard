import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGuestInvite,
  parseOuraConnectionTarget,
} from "../../../features/oura-connection/domain/connection-input.ts";
import { ConnectionInviteError } from "../../../features/oura-connection/server/invite-service.ts";

test("connection targets accept only normalized add and reconnect inputs", () => {
  assert.deepEqual(
    parseOuraConnectionTarget({ mode: "add", displayName: "  Family   Member  " }),
    { mode: "add", displayName: "Family Member" },
  );
  assert.deepEqual(
    parseOuraConnectionTarget({ mode: "reconnect", profileId: "profile-1" }),
    { mode: "reconnect", profileId: "profile-1" },
  );

  for (const input of [
    null,
    { mode: "add", displayName: "Name", ownerId: "owner-a" },
    { mode: "reconnect", profileId: "bad id" },
    { mode: "other", profileId: "profile-1" },
  ]) {
    assert.throws(() => parseOuraConnectionTarget(input));
  }
});

test("guest invite input is exact, bounded, and uses one safe error", () => {
  assert.deepEqual(parseGuestInvite({ invite: "abc" }), { invite: "abc" });

  for (const input of [
    null,
    {},
    { invite: "" },
    { invite: "x".repeat(257) },
    { invite: "abc", ownerId: "owner-a" },
  ]) {
    assert.throws(
      () => parseGuestInvite(input),
      (error) =>
        error instanceof ConnectionInviteError && error.code === "unavailable",
    );
  }
});
