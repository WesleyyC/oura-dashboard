import {
  AuthenticationError,
  OwnerAccessError,
  requireRequestUser,
} from "@/platform/auth/server";
import {
  markProfileConnected,
  ProfileNotFoundError,
} from "@/features/profile-management/server";
import {
  cancelConnectionInvite,
  consumeOAuthState,
  exchangeAuthorizationCode,
  oauthConfigFor,
  SafeOuraError,
  type SafeOuraErrorCode,
  saveTokenSet,
} from "@/features/oura-connection/server";

type CallbackStatus =
  | "connected"
  | "denied"
  | "invalid_state"
  | "setup_required"
  | "callback_invalid"
  | "connection_failed";

export async function GET(request: Request) {
  let user;
  try {
    user = requireRequestUser(request);
  } catch (error) {
    if (error instanceof OwnerAccessError) {
      return ownerAccessRedirect(request, error);
    }
    if (error instanceof AuthenticationError) {
      return callbackRedirect(request, "invalid_state");
    }
    throw error;
  }

  const url = new URL(request.url);
  const rawState = url.searchParams.get("state");
  if (!rawState) return callbackRedirect(request, "invalid_state");

  try {
    const binding = await consumeOAuthState(rawState);
    if (binding.flow !== "owner" || binding.ownerId !== user.userId) {
      return callbackRedirect(request, "invalid_state");
    }
    if (url.searchParams.has("error")) {
      return callbackRedirect(request, "denied");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new SafeOuraError("invalid_request");
    const config = oauthConfigFor(request, "owner");
    const tokens = await exchangeAuthorizationCode(config, code);
    await saveTokenSet(binding.ownerId, binding.profileId, tokens);
    await markProfileConnected(binding.ownerId, binding.profileId);
    await cancelConnectionInvite(binding.ownerId, binding.profileId);
    return callbackRedirect(request, "connected");
  } catch (error) {
    if (error instanceof SafeOuraError) {
      console.warn("Oura callback rejected", { code: error.code, flow: "owner" });
      return callbackRedirect(request, callbackStatus(error.code));
    }
    if (error instanceof ProfileNotFoundError) {
      return callbackRedirect(request, "invalid_state");
    }
    console.error("Oura callback failed");
    return callbackRedirect(request, "connection_failed");
  }
}

function ownerAccessRedirect(
  request: Request,
  error: OwnerAccessError,
): Response {
  const location = new URL("/access-denied", request.url);
  if (error.code === "owner_allowlist_unavailable") {
    location.searchParams.set("reason", "unavailable");
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: location.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}

function callbackStatus(code: SafeOuraErrorCode): CallbackStatus {
  switch (code) {
    case "configuration_missing":
      return "setup_required";
    case "invalid_oauth_state":
    case "profile_not_found":
      return "invalid_state";
    case "invalid_callback_origin":
    case "invalid_request":
      return "callback_invalid";
    case "oauth_client_rejected":
    case "oauth_grant_rejected":
    case "oauth_request_rejected":
    case "oauth_scope_rejected":
    case "token_access_invalid":
    case "token_endpoint_rate_limited":
    case "token_endpoint_unavailable":
    case "token_expiry_invalid":
    case "token_exchange_failed":
    case "token_payload_unreadable":
    case "token_refresh_invalid":
    case "token_response_invalid":
      return "connection_failed";
  }
}

function callbackRedirect(
  request: Request,
  status: CallbackStatus,
): Response {
  const location = new URL("/settings", request.url);
  location.searchParams.set("oura", status);
  return new Response(null, {
    status: 303,
    headers: {
      Location: location.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
