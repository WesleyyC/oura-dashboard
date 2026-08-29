import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner invitation routes require trusted identity and reject client ownership", async () => {
  const [route, directRoute] = await Promise.all([
    readFile(new URL("../../../app/api/oura/invites/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/oura/authorize/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /requireRequestUser\(request\)/);
  assert.match(route, /issueConnectionInvite\(\s*user\.userId/);
  assert.match(route, /cancelConnectionInvite\(user\.userId/);
  assert.doesNotMatch(
    route,
    /body\.ownerId|body\.owner_id|searchParams\.get\(["']owner/i,
  );
  assert.match(directRoute, /parseOuraConnectionTarget/);
});

test("guest routes exchange only the invitation capability for OAuth", async () => {
  const [inspectRoute, authorizeRoute] = await Promise.all([
    readFile(new URL("../../../app/api/oura/guest/inspect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/oura/guest/authorize/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(inspectRoute, /requireRequestUser|parseChatGPTUser/);
  assert.doesNotMatch(authorizeRoute, /requireRequestUser|parseChatGPTUser/);
  assert.match(inspectRoute, /inspectConnectionInvite\(input\.invite\)/);
  assert.match(inspectRoute, /displayName:\s*profile\.displayName/);
  assert.match(inspectRoute, /expiresAt:\s*binding\.expiresAt/);
  assert.doesNotMatch(inspectRoute, /ownerId:\s*binding|profileId:\s*binding/);
  assert.match(authorizeRoute, /consumeConnectionInvite\(input\.invite\)/);
  assert.match(
    authorizeRoute,
    /issueOAuthState\([\s\S]*binding\.ownerId,[\s\S]*binding\.profileId,[\s\S]*"guest"/,
  );
  assert.match(authorizeRoute, /oauthConfigFor\(request,\s*"guest"\)/);
  assert.doesNotMatch(
    `${inspectRoute}\n${authorizeRoute}`,
    /console\.(?:log|error|warn)|accessToken|refreshToken|healthDaily/i,
  );
});

test("owner and guest callbacks enforce separate server-recorded flows", async () => {
  const [ownerCallback, guestCallback] = await Promise.all([
    readFile(new URL("../../../app/api/oura/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/oura/guest/callback/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(ownerCallback, /requireRequestUser\(request\)/);
  assert.ok(
    ownerCallback.indexOf("requireRequestUser(request)") <
      ownerCallback.indexOf("consumeOAuthState(rawState)"),
    "owner authentication must happen before single-use state consumption",
  );
  assert.match(ownerCallback, /binding\.flow\s*!==\s*"owner"/);
  assert.match(ownerCallback, /oauthConfigFor\(request,\s*"owner"\)/);

  assert.doesNotMatch(
    guestCallback,
    /requireRequestUser|parseChatGPTUser|requireAllowedOwner/,
  );
  assert.match(guestCallback, /consumeOAuthState\(rawState\)/);
  assert.match(guestCallback, /binding\.flow\s*!==\s*"guest"/);
  assert.match(guestCallback, /oauthConfigFor\(request,\s*"guest"\)/);
  assert.match(guestCallback, /\/connect\/oura\/complete/);
  assert.doesNotMatch(
    `${ownerCallback}\n${guestCallback}`,
    /error\.message|JSON\.stringify\(error\)|console\.log/,
  );
});

test("guest request validation gives every unusable invite one safe response", async () => {
  const [inspectRoute, authorizeRoute] = await Promise.all([
    readFile(new URL("../../../app/api/oura/guest/inspect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/oura/guest/authorize/route.ts", import.meta.url), "utf8"),
  ]);

  for (const source of [inspectRoute, authorizeRoute]) {
    assert.match(source, /parseGuestInvite/);
    assert.match(source, /ConnectionInviteError/);
    assert.match(source, /invite_unavailable/);
    assert.match(source, /status:\s*410/);
    assert.match(source, /Cache-Control["']:\s*["']no-store/);
    assert.doesNotMatch(source, /error\.message|JSON\.stringify\(error/);
  }
});

test("guest client removes the fragment before inspecting or redirecting", async () => {
  const source = await readFile(
    new URL("../../../features/oura-connection/components/GuestOuraConnect.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /window\.location\.hash\.slice\(1\)/);
  assert.match(source, /params\.get\("invite"\)/);
  assert.match(source, /window\.history\.replaceState\(null,\s*"",\s*"\/connect\/oura"\)/);
  assert.match(source, /\/api\/oura\/guest\/inspect/);
  assert.match(source, /\/api\/oura\/guest\/authorize/);
  assert.match(source, /destination\.hostname\s*!==\s*"cloud\.ouraring\.com"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
});
