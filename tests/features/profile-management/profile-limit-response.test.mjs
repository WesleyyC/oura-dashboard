import assert from "node:assert/strict";
import test from "node:test";

import { profileLimitResponse } from "../../../features/profile-management/server/profile-limit-response.ts";
import { ProfileLimitReachedError } from "../../../features/profile-management/server/profile-service.ts";

test("profile limit errors become one private conflict response", async () => {
  const response = profileLimitResponse(new ProfileLimitReachedError());

  assert.ok(response);
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "profile_limit_reached",
    limit: 8,
  });
  assert.equal(profileLimitResponse(new Error("different failure")), null);
});
