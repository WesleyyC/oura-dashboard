import {
  MAX_HEALTH_PROFILES,
  ProfileLimitReachedError,
} from "./profile-service";

export function profileLimitResponse(error: unknown): Response | null {
  if (!(error instanceof ProfileLimitReachedError)) return null;
  return Response.json({
    error: "profile_limit_reached",
    limit: MAX_HEALTH_PROFILES,
  }, {
    status: 409,
    headers: { "Cache-Control": "private, no-store" },
  });
}
