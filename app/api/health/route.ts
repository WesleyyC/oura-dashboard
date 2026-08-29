import {
  requestUserErrorResponse,
  requireRequestUser,
} from "@/platform/auth/server";
import { ProfileNotFoundError } from "@/features/profile-management/server";
import {
  parseHealthQuery,
  readHealthRange,
} from "@/features/health-data/server";

export async function GET(request: Request) {
  let user;
  try {
    user = requireRequestUser(request);
  } catch (error) {
    const response = requestUserErrorResponse(error);
    if (response) return response;
    throw error;
  }

  let range: ReturnType<typeof parseHealthQuery>;
  try {
    const url = new URL(request.url);
    range = parseHealthQuery(url.searchParams);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date range";
    return noStore({ error: message }, 400);
  }

  try {
    const result = await readHealthRange(
      user.userId,
      range.profile,
      range.start,
      range.end,
    );
    return noStore(result);
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return noStore({ error: "profile_not_found" }, 404);
    }
    console.error("Health data read failed");
    return noStore({ error: "Health data is temporarily unavailable" }, 500);
  }
}

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
