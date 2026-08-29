import { parseGuestInvite } from "@/features/oura-connection/server";
import {
  ConnectionInviteError,
  consumeConnectionInvite,
} from "@/features/oura-connection/server";
import {
  buildAuthorizationUrl,
  issueOAuthState,
  oauthConfigFor,
  SafeOuraError,
} from "@/features/oura-connection/server";

export async function POST(request: Request) {
  try {
    const input = parseGuestInvite(await request.json());
    const config = oauthConfigFor(request, "guest");
    const binding = await consumeConnectionInvite(input.invite);
    const state = await issueOAuthState(
      binding.ownerId,
      binding.profileId,
      "guest",
    );
    return Response.json({
      authorizationUrl: buildAuthorizationUrl(config, state),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConnectionInviteError || error instanceof SyntaxError) {
      return unavailable();
    }
    if (error instanceof SafeOuraError) {
      return Response.json({ error: error.code }, {
        status: error.code === "configuration_missing" ? 503 : 400,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ error: "temporarily_unavailable" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function unavailable(): Response {
  return Response.json({ error: "invite_unavailable" }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
