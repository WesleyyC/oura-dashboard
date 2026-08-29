import assert from "node:assert/strict";
import test from "node:test";

import {
  callbackNotice,
  formatTimestamp,
} from "../../../features/profile-management/model/settings-state.ts";

test("callbackNotice preserves every Oura callback message", () => {
  assert.deepEqual(callbackNotice("connected"), {
    tone: "success",
    text: "Oura connected. You can refresh this profile now.",
  });
  assert.deepEqual(callbackNotice("denied"), {
    tone: "neutral",
    text: "Oura connection was canceled.",
  });
  assert.deepEqual(callbackNotice("setup_required"), {
    tone: "error",
    text: "Oura application setup is required in Sites Settings.",
  });
  for (const status of ["invalid_state", "callback_invalid"]) {
    assert.deepEqual(callbackNotice(status), {
      tone: "error",
      text: "That Oura connection link expired. Start again.",
    });
  }
  assert.deepEqual(callbackNotice("unknown"), {
    tone: "error",
    text: "Oura could not be connected. Try again.",
  });
});

test("formatTimestamp safely labels invalid timestamps", () => {
  assert.equal(formatTimestamp("not-a-time"), "previously");
  assert.notEqual(formatTimestamp("2026-08-01T12:00:00.000Z"), "previously");
});
