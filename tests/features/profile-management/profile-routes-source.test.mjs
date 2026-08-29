import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("profile and account routes derive tenant ownership only from trusted identity", async () => {
  const [profilesRoute, accountRoute] = await Promise.all([
    readFile(new URL("../../../app/api/profiles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/account/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(profilesRoute, /requireRequestUser\(request\)/);
  assert.doesNotMatch(
    profilesRoute,
    /body\.ownerId|body\.owner_id|searchParams\.get\(["']owner/i,
  );
  assert.match(profilesRoute, /removeProfile\(user\.userId,\s*profileId\)/);
  assert.match(accountRoute, /ensureHealthAccount\(user\.userId\)/);
  assert.match(accountRoute, /deleteAccount\(user\.userId\)/);
  assert.doesNotMatch(accountRoute, /body\.ownerId|body\.owner_id/i);
});

test("account configuration response exposes presence only", async () => {
  const source = await readFile(
    new URL("../../../app/api/account/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /ouraClientId:\s*Boolean\(/);
  assert.match(source, /ouraClientSecret:\s*Boolean\(/);
  assert.match(source, /tokenEncryptionKey:\s*Boolean\(/);
  assert.doesNotMatch(source, /OURA_CLIENT_SECRET\s*[,}]/);
  assert.doesNotMatch(source, /OURA_TOKEN_ENCRYPTION_KEY\s*[,}]/);
});

test("authenticated profile summaries expose safe update and color metadata", async () => {
  const [types, repository, profilesRoute] = await Promise.all([
    readFile(
      new URL(
        "../../../features/profile-management/domain/contracts.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../features/profile-management/server/profile-repository.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../../app/api/profiles/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(types, /HealthProfileSummary[\s\S]*updatedAt:\s*string/);
  assert.match(types, /HealthProfileSummary[\s\S]*colorKey:\s*ProfileColorKey/);
  assert.match(repository, /updatedAt:\s*healthProfiles\.updatedAt/);
  assert.match(repository, /colorKey:\s*healthProfiles\.colorKey/);
  assert.match(repository, /updatedAt:\s*row\.updatedAt/);
  assert.match(
    repository,
    /resolveProfileColorKey\(row\.colorKey,\s*row\.id\)/,
  );
  assert.match(
    await readFile(
      new URL(
        "../../../features/profile-management/server/profile-service.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    /nextProfileColorKey/,
  );
  assert.match(profilesRoute, /colorKey/);
  assert.doesNotMatch(
    profilesRoute,
    /body\.ownerId|body\.owner_id|searchParams\.get\(["']owner/i,
  );
});

test("Oura OAuth callback derives trust from server-recorded state flow", async () => {
  const [authorizeRoute, callbackRoute, oauth] = await Promise.all([
    readFile(new URL("../../../app/api/oura/authorize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/oura/callback/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../features/oura-connection/server/oauth-service.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(authorizeRoute, /requireRequestUser\(request\)/);
  assert.match(authorizeRoute, /issueOAuthState\([^)]*"owner"/s);
  assert.match(callbackRoute, /requireRequestUser\(request\)/);
  assert.doesNotMatch(callbackRoute, /parseChatGPTUser|requireAllowedOwner/);
  assert.match(callbackRoute, /binding\.flow\s*!==\s*"owner"/);
  assert.match(callbackRoute, /binding\.ownerId\s*!==\s*user\.userId/);
  assert.ok(
    callbackRoute.indexOf("requireRequestUser(request)") <
      callbackRoute.indexOf("await consumeOAuthState"),
  );
  assert.ok(
    callbackRoute.indexOf("await consumeOAuthState") <
      callbackRoute.indexOf("await exchangeAuthorizationCode"),
  );
  assert.doesNotMatch(
    `${authorizeRoute}\n${callbackRoute}`,
    /body\.ownerId|body\.owner_id|searchParams\.get\(["']owner/i,
  );
  assert.match(
    callbackRoute,
    /saveTokenSet\(binding\.ownerId,\s*binding\.profileId,\s*tokens\)/,
  );
  assert.match(oauth, /hashOAuthState\(rawState\)/);
  assert.match(oauth, /takeState\(stateHash\)/);
  assert.doesNotMatch(oauth, /console\.(?:log|error|warn)/);
});

test("refresh route and lease are tenant-scoped and return safe status only", async () => {
  const [route, refresh, refreshState] = await Promise.all([
    readFile(new URL("../../../app/api/oura/refresh/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../features/oura-connection/server/refresh-service.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../features/oura-connection/server/refresh-state-repository.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(route, /requireRequestUser\(request\)/);
  assert.match(route, /refreshProfile\(user\.userId,\s*input\.profileId/);
  assert.match(route, /timeZone:\s*input\.timeZone/);
  assert.match(route, /parseRefreshRequest\(await request\.json\(\)\)/);
  assert.doesNotMatch(
    route,
    /body\.ownerId|body\.owner_id|searchParams\.get\(["']owner/i,
  );
  assert.match(
    refreshState,
    /WHERE owner_id = \?[\s\S]*AND profile_id = \?[\s\S]*lock_expires_at/s,
  );
  assert.match(refreshState, /meta\.changes/);
  assert.doesNotMatch(refresh, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(refreshState, /console\.(?:log|error|warn)/);
});

test("family setup manages OAuth profiles without accepting credentials", async () => {
  const [controller, api, screen, handoff] = await Promise.all([
    readFile(
      new URL("../../../features/profile-management/model/use-settings-controller.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../features/profile-management/client/settings-api.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../features/profile-management/components/SettingsScreen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../features/profile-management/components/OuraConnectionHandoff.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(controller, /mode:\s*"add"/);
  assert.match(controller, /mode:\s*"reconnect"/);
  assert.match(controller, /window\.location\.assign\(authorizationUrl\)/);
  assert.match(screen, /Connect here/);
  assert.match(screen, /Send link/);
  assert.match(api, /\/api\/oura\/invites/);
  assert.match(controller, /window\.setInterval\([\s\S]*3_000/);
  assert.match(controller, /window\.clearInterval/);
  assert.match(controller, /Oura connected for \$\{target\.displayName\}/);
  assert.match(handoff, /QRCodeSVG/);
  assert.match(handoff, /Copy connection link/);
  assert.match(handoff, /Open on this device/);
  assert.match(handoff, /Check connection/);
  assert.match(handoff, /Cancel link/);
  assert.match(handoff, /role="dialog"/);
  assert.match(controller, /Remove [^?]+ from this dashboard/);
  assert.match(api, /confirmation:\s*"DELETE"/);
  assert.match(screen, /value=\{deleteConfirmation\}/);
  assert.doesNotMatch(
    `${controller}\n${api}\n${screen}\n${handoff}`,
    /OURA_CLIENT_SECRET|OURA_TOKEN_ENCRYPTION_KEY|accessToken|refreshToken/,
  );
});
