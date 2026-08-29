import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_COLOR_PALETTE,
  nextProfileColorKey,
  parseProfileColorKey,
  profileColorCssValue,
  resolveProfileColorKey,
} from "../../../features/profile-management/domain/profile-colors.ts";
import { parseProfileUpdatePayload } from "../../../features/profile-management/domain/validation.ts";

test("profile colors expose six curated semantic choices", () => {
  assert.deepEqual(
    PROFILE_COLOR_PALETTE.map(({ key }) => key),
    ["ocean", "berry", "meadow", "sunset", "iris", "lagoon"],
  );
  assert.equal(parseProfileColorKey("berry"), "berry");
  assert.equal(profileColorCssValue("berry"), "var(--profile-berry)");
  assert.throws(() => parseProfileColorKey("#ff00ff"), /colorKey/i);
});

test("defaults prefer unused colors and cycle only after all six", () => {
  assert.equal(nextProfileColorKey(["ocean", "berry"], 2), "meadow");
  assert.equal(
    nextProfileColorKey(
      ["ocean", "berry", "meadow", "sunset", "iris", "lagoon"],
      7,
    ),
    "berry",
  );
});

test("unknown stored values resolve from immutable profile identity", () => {
  const fallback = resolveProfileColorKey(null, "profile-a");
  assert.ok(PROFILE_COLOR_PALETTE.some(({ key }) => key === fallback));
  assert.equal(resolveProfileColorKey("bad", "profile-a"), fallback);
  assert.equal(resolveProfileColorKey("lagoon", "profile-a"), "lagoon");
});

test("profile updates accept semantic keys and reject raw colors", () => {
  assert.deepEqual(
    parseProfileUpdatePayload({ profileId: "profile-a", colorKey: "iris" }),
    { profileId: "profile-a", colorKey: "iris" },
  );
  assert.throws(
    () => parseProfileUpdatePayload({
      profileId: "profile-a",
      colorKey: "#5500aa",
    }),
    /colorKey/i,
  );
  assert.throws(
    () => parseProfileUpdatePayload({ profileId: "profile-a", color: "iris" }),
    /Unknown/i,
  );
});
