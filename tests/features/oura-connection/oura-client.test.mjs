import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchOuraResource,
  OuraApiError,
} from "../../../features/oura-connection/server/oura-client.ts";

const RANGE = { start: "2026-07-23", end: "2026-07-30" };

test("exclusive upstream resources widen once and filter spillover", async () => {
  const requests = [];
  const rows = await fetchOuraResource(
    "daily_activity",
    RANGE,
    "access-token",
    {
      fetchImpl: async (input) => {
        requests.push(new URL(input));
        return Response.json({
          data: [
            { day: "2026-07-22", score: 70 },
            { day: "2026-07-23", score: 71 },
            { day: "2026-07-30", score: 78 },
            { day: "2026-07-31", score: 79 },
          ],
          next_token: null,
        });
      },
    },
  );

  assert.equal(requests[0].searchParams.get("start_date"), "2026-07-23");
  assert.equal(requests[0].searchParams.get("end_date"), "2026-07-31");
  assert.deepEqual(rows.map((row) => row.day), ["2026-07-23", "2026-07-30"]);
});

test("inclusive resources keep the requested final date", async () => {
  let requestUrl;
  await fetchOuraResource("daily_sleep", RANGE, "access-token", {
    fetchImpl: async (input) => {
      requestUrl = new URL(input);
      return Response.json({ data: [], next_token: null });
    },
  });
  assert.equal(requestUrl.searchParams.get("end_date"), "2026-07-30");
});

test("pagination rejects repeated next tokens", async () => {
  let page = 0;
  await assert.rejects(
    fetchOuraResource("daily_sleep", RANGE, "access-token", {
      fetchImpl: async () => {
        page += 1;
        return Response.json({
          data: [],
          next_token: page === 1 ? "repeat-me" : "repeat-me",
        });
      },
    }),
    (error) =>
      error instanceof OuraApiError &&
      error.code === "pagination" &&
      /pagination/i.test(error.message),
  );
});

test("rate limits retry twice with capped delay and fixed bearer auth", async () => {
  const waits = [];
  const requests = [];
  let attempt = 0;
  const rows = await fetchOuraResource(
    "workout",
    RANGE,
    "access-token",
    {
      fetchImpl: async (input, init) => {
        attempt += 1;
        requests.push({ url: new URL(input), init });
        if (attempt < 3) {
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": "600" },
          });
        }
        return Response.json({ data: [], next_token: null });
      },
      sleep: async (milliseconds) => waits.push(milliseconds),
    },
  );

  assert.deepEqual(rows, []);
  assert.deepEqual(waits, [60_000, 60_000]);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].init.headers.Authorization, "Bearer access-token");
  assert.equal(requests[0].init.redirect, "manual");
});

test("authorization failures use a safe category without reflecting tokens", async () => {
  await assert.rejects(
    fetchOuraResource("daily_readiness", RANGE, "secret-access-token", {
      fetchImpl: async () => Response.json({
        detail: "secret-access-token",
      }, { status: 401 }),
    }),
    (error) =>
      error instanceof OuraApiError &&
      error.code === "unauthorized" &&
      !error.message.includes("secret-access-token"),
  );
});

test("the hosted client rejects resources outside the aggregate allowlist", async () => {
  await assert.rejects(
    fetchOuraResource("personal_info", RANGE, "access-token"),
    /resource/i,
  );
});
