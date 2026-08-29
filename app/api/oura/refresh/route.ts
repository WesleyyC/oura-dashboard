import {
  requestUserErrorResponse,
  requireRequestUser,
} from "@/platform/auth/server";
import {
  oauthConfigFor,
  parseRefreshRequest,
  refreshProfile,
  SafeOuraError,
  type RefreshRequest,
  type ProfileRefreshResult,
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

  let input: RefreshRequest;
  try {
    input = parseRefreshRequest(await request.json());
  } catch {
    return noStore({ error: "invalid_request" }, 400);
  }

  try {
    const result = await refreshProfile(user.userId, input.profileId, {
      force: input.force,
      timeZone: input.timeZone,
      oauthConfig: oauthConfigFor(request, "owner"),
    });
    return noStore(result);
  } catch (error) {
    if (
      error instanceof SafeOuraError &&
      error.code === "configuration_missing"
    ) {
      return noStore(
        failedResult(input.profileId, "configuration_missing"),
        503,
      );
    }
    return noStore(failedResult(input.profileId, "unexpected"), 500);
  }
}

function failedResult(
  profileId: string,
  safeErrorCode: "configuration_missing" | "unexpected",
): ProfileRefreshResult {
  return {
    profileId,
    status: "failed",
    lastSucceededAt: null,
    safeErrorCode,
  };
}

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
