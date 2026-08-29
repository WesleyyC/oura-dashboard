import assert from "node:assert/strict";
import test from "node:test";

import {
  OwnerAccessError,
  parseOwnerEmailAllowlist,
  requireAllowedOwner,
} from "../../../platform/auth/owner-allowlist.ts";

const OWNER = {
  userId: "user-1",
  email: "OWNER@EXAMPLE.COM",
  fullName: null,
  displayName: "Owner",
};

test("owner allowlist normalizes and deduplicates comma-separated emails", () => {
  const emails = parseOwnerEmailAllowlist(
    " Owner@Example.com, friend@example.net, owner@example.com, ",
  );

  assert.deepEqual(
    [...emails],
    ["owner@example.com", "friend@example.net"],
  );
});

test("approved owner comparison is case-insensitive", () => {
  assert.equal(
    requireAllowedOwner(OWNER, "owner@example.com").userId,
    "user-1",
  );
});

test("unapproved owners fail without reflecting either email", () => {
  assert.throws(
    () => requireAllowedOwner(
      { ...OWNER, email: "other@example.org" },
      "owner@example.com",
    ),
    (error) =>
      error instanceof OwnerAccessError &&
      error.status === 403 &&
      error.code === "owner_not_allowed" &&
      !/other@example\.org|owner@example\.com/i.test(error.message),
  );
});

test("missing empty and malformed allowlists fail closed", () => {
  for (const value of [
    undefined,
    "",
    "not-an-email",
    "one@example.com, bad value",
    "one@@example.com",
    "@example.com",
    "owner@",
  ]) {
    assert.throws(
      () => parseOwnerEmailAllowlist(value),
      (error) =>
        error instanceof OwnerAccessError &&
        error.status === 503 &&
        error.code === "owner_allowlist_unavailable" &&
        (!value || !String(error.message).includes(value)),
    );
  }
});
