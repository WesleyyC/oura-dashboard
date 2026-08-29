import {
  requestUserErrorResponse,
  requireRequestUser,
  type ChatGPTUser,
} from "@/platform/auth/server";
import {
  createPendingProfile,
  listProfiles,
  ProfileNotFoundError,
  profileLimitResponse,
  removeProfile,
  updateProfile,
  parseProfileCreatePayload,
  parseProfileId,
  parseProfileUpdatePayload,
} from "@/features/profile-management/server";

export async function GET(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    return noStore({ profiles: await listProfiles(user.userId) });
  } catch {
    console.error("Profile list failed");
    return serverError();
  }
}

export async function POST(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    const payload = parseProfileCreatePayload(await request.json());
    const profile = await createPendingProfile(user.userId, payload.displayName);
    return noStore({ profile }, 201);
  } catch (error) {
    const limitResponse = profileLimitResponse(error);
    if (limitResponse) return limitResponse;
    if (error instanceof SyntaxError || error instanceof Error && isValidationError(error)) {
      return Response.json({ error: safeMessage(error) }, { status: 400 });
    }
    console.error("Profile creation failed");
    return serverError();
  }
}

export async function PATCH(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    const input = parseProfileUpdatePayload(await request.json());
    return noStore({ profile: await updateProfile(user.userId, input) });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    if (error instanceof SyntaxError || error instanceof Error && isValidationError(error)) {
      return Response.json({ error: safeMessage(error) }, { status: 400 });
    }
    console.error("Profile update failed");
    return serverError();
  }
}

export async function DELETE(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    const params = new URL(request.url).searchParams;
    const unknown = [...params.keys()].find((key) => key !== "profile_id");
    if (unknown) throw new Error(`Unknown profile query field: ${unknown}`);
    const profileId = parseProfileId(params.get("profile_id"));
    await removeProfile(user.userId, profileId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    if (error instanceof Error && isValidationError(error)) {
      return Response.json({ error: safeMessage(error) }, { status: 400 });
    }
    console.error("Profile removal failed");
    return serverError();
  }
}

function authenticatedUser(request: Request): ChatGPTUser | Response {
  try {
    return requireRequestUser(request);
  } catch (error) {
    const response = requestUserErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

function isValidationError(error: Error): boolean {
  return /displayName|profileId|colorKey|sortOrder|disabled|payload|update|Unknown/i.test(
    error.message,
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid profile request";
}

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function serverError(): Response {
  return Response.json({ error: "Profile service is temporarily unavailable" }, {
    status: 500,
    headers: { "Cache-Control": "private, no-store" },
  });
}
