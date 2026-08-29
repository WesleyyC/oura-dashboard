import {
  getProfile,
  ProfileNotFoundError,
} from "@/features/profile-management/server";
import { parseGuestInvite } from "@/features/oura-connection/server";
import {
  ConnectionInviteError,
  inspectConnectionInvite,
} from "@/features/oura-connection/server";

export async function POST(request: Request) {
  try {
    const input = parseGuestInvite(await request.json());
    const binding = await inspectConnectionInvite(input.invite);
    const profile = await getProfile(binding.ownerId, binding.profileId);
    if (!profile) throw new ConnectionInviteError();
    return Response.json({
      displayName: profile.displayName,
      expiresAt: binding.expiresAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (
      error instanceof ConnectionInviteError ||
      error instanceof ProfileNotFoundError ||
      error instanceof SyntaxError
    ) {
      return unavailable();
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
