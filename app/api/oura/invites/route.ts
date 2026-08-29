import {
  requestUserErrorResponse,
  requireRequestUser,
} from "@/platform/auth/server";
import {
  createPendingProfile,
  getProfile,
  parseProfileId,
  ProfileNotFoundError,
  profileLimitResponse,
  removeProfile,
} from "@/features/profile-management/server";
import {
  parseOuraConnectionTarget,
} from "@/features/oura-connection/server";
import {
  cancelConnectionInvite,
  ConnectionInviteError,
  issueConnectionInvite,
} from "@/features/oura-connection/server";

export async function POST(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  let createdProfileId: string | null = null;
  try {
    const input = parseOuraConnectionTarget(await request.json());
    const profile = input.mode === "add"
      ? await createPendingProfile(user.userId, input.displayName)
      : await getProfile(user.userId, input.profileId);
    if (!profile) throw new ProfileNotFoundError();
    if (input.mode === "add") createdProfileId = profile.id;

    const invitation = await issueConnectionInvite(
      user.userId,
      profile.id,
      request,
    );
    return Response.json({
      profile,
      handoff: {
        connectUrl: invitation.connectUrl,
        expiresAt: invitation.expiresAt,
      },
    }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (createdProfileId) {
      try {
        await removeProfile(user.userId, createdProfileId);
      } catch {
        console.error("Pending Oura profile cleanup failed");
      }
    }
    const limitResponse = profileLimitResponse(error);
    if (limitResponse) return limitResponse;
    if (error instanceof ProfileNotFoundError) {
      return privateJson({ error: "profile_not_found" }, 404);
    }
    if (error instanceof ConnectionInviteError) {
      return privateJson({ error: "invite_unavailable" }, 400);
    }
    if (error instanceof SyntaxError || error instanceof Error && isValidationError(error)) {
      return privateJson({ error: "invalid_request" }, 400);
    }
    console.error("Oura invitation creation failed");
    return privateJson({ error: "temporarily_unavailable" }, 500);
  }
}

export async function DELETE(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    const value = await request.json();
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      !Object.hasOwn(value, "profileId")
    ) {
      throw new Error("Invalid cancellation request");
    }
    const profileId = parseProfileId((value as Record<string, unknown>).profileId);
    const profile = await getProfile(user.userId, profileId);
    if (!profile) throw new ProfileNotFoundError();
    await cancelConnectionInvite(user.userId, profile.id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return privateJson({ error: "profile_not_found" }, 404);
    }
    if (error instanceof SyntaxError || error instanceof Error && isValidationError(error)) {
      return privateJson({ error: "invalid_request" }, 400);
    }
    console.error("Oura invitation cancellation failed");
    return privateJson({ error: "temporarily_unavailable" }, 500);
  }
}

function authenticatedUser(request: Request) {
  try {
    return requireRequestUser(request);
  } catch (error) {
    const response = requestUserErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

function privateJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function isValidationError(error: Error): boolean {
  return /mode|displayName|profileId|Unknown|Invalid/.test(error.message);
}
