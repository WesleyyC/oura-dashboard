import {
  requestUserErrorResponse,
  requireRequestUser,
} from "@/platform/auth/server";
import {
  createPendingProfile,
  listProfiles,
  profileLimitResponse,
} from "@/features/profile-management/server";
import {
  parseOuraConnectionTarget,
} from "@/features/oura-connection/server";
import {
  buildAuthorizationUrl,
  issueOAuthState,
  oauthConfigFor,
  SafeOuraError,
} from "@/features/oura-connection/server";

export async function POST(request: Request) {
  let user;
  try {
    user = requireRequestUser(request);
  } catch (error) {
    const response = requestUserErrorResponse(error);
    if (response) return response;
    throw error;
  }

  try {
    const input = parseOuraConnectionTarget(await request.json());
    const config = oauthConfigFor(request, "owner");
    let profileId: string;
    if (input.mode === "add") {
      const profile = await createPendingProfile(user.userId, input.displayName);
      profileId = profile.id;
    } else {
      const profiles = await listProfiles(user.userId);
      const profile = profiles.find(({ id }) => id === input.profileId);
      if (!profile) throw new SafeOuraError("profile_not_found");
      profileId = profile.id;
    }
    const state = await issueOAuthState(
      user.userId,
      profileId,
      "owner",
    );
    return Response.json({
      authorizationUrl: buildAuthorizationUrl(config, state),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const limitResponse = profileLimitResponse(error);
    if (limitResponse) return limitResponse;
    if (error instanceof SafeOuraError) {
      return Response.json({ error: error.code }, {
        status: error.code === "configuration_missing" ? 503 : 400,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (error instanceof SyntaxError || error instanceof Error && /mode|displayName|profileId|Unknown/.test(error.message)) {
      return Response.json({ error: "invalid_request" }, {
        status: 400,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    console.error("Oura authorization start failed");
    return Response.json({ error: "temporarily_unavailable" }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
