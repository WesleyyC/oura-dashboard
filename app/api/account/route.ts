import {
  requestUserErrorResponse,
  requireRequestUser,
  type ChatGPTUser,
} from "@/platform/auth/server";
import {
  deleteAccount,
  ensureHealthAccount,
} from "@/features/profile-management/server";
import { isValidEncryptionKeyText } from "@/features/oura-connection/server";
import { getRuntimeEnv } from "@/platform/runtime/server";

export async function GET(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    await ensureHealthAccount(user.userId);
    const env = getRuntimeEnv();
    return Response.json({
      configured: {
        ouraClientId: Boolean(env.OURA_CLIENT_ID?.trim()),
        ouraClientSecret: Boolean(env.OURA_CLIENT_SECRET?.trim()),
        tokenEncryptionKey: Boolean(
          isValidEncryptionKeyText(env.OURA_TOKEN_ENCRYPTION_KEY),
        ),
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    console.error("Account status failed");
    return serverError();
  }
}

export async function DELETE(request: Request) {
  const user = authenticatedUser(request);
  if (user instanceof Response) return user;

  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Confirmation payload must be an object");
    }
    const fields = Object.keys(payload);
    if (fields.length !== 1 || fields[0] !== "confirmation") {
      throw new Error("Confirmation payload must contain only confirmation");
    }
    if ((payload as Record<string, unknown>).confirmation !== "DELETE") {
      throw new Error("confirmation must equal DELETE");
    }
    await deleteAccount(user.userId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof Error && /[Cc]onfirmation/.test(error.message)
    ) {
      const message = error instanceof Error ? error.message : "Invalid confirmation";
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("Account deletion failed");
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

function serverError(): Response {
  return Response.json({ error: "Account service is temporarily unavailable" }, {
    status: 500,
    headers: { "Cache-Control": "private, no-store" },
  });
}
