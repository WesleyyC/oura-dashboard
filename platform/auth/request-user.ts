import { getRuntimeEnv } from "../runtime/server";
import {
  OwnerAccessError,
  requireAllowedOwner,
} from "./owner-allowlist.ts";

export interface ChatGPTUser {
  userId: string;
  email: string;
  fullName: string | null;
  displayName: string;
}

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Sign in with ChatGPT is required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export function parseChatGPTUser(headers: Headers): ChatGPTUser | null {
  const userId = headers.get("oai-authenticated-user-id");
  const email = headers.get("oai-authenticated-user-email");
  if (!userId || !email) return null;

  const encodedFullName = headers.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    headers.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? safeDecode(encodedFullName)
      : null;

  return {
    userId,
    email,
    fullName,
    displayName: fullName ?? email,
  };
}

export function requireRequestUser(
  request: Request,
  allowlistText?: string,
): ChatGPTUser {
  const user = parseChatGPTUser(request.headers);
  if (!user) throw new AuthenticationError();
  return requireAllowedOwner(
    user,
    allowlistText ?? getRuntimeEnv().OWNER_EMAIL_ALLOWLIST,
  );
}

export function requestUserErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthenticationError) {
    return privateError("authentication_required", error.status);
  }
  if (error instanceof OwnerAccessError) {
    return privateError(error.code, error.status);
  }
  return null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function privateError(error: string, status: number): Response {
  return Response.json({ error }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
