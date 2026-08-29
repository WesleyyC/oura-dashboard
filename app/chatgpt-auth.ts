import {
  OwnerAccessError,
  parseChatGPTUser,
  requireAllowedOwner,
  type ChatGPTUser,
} from "@/platform/auth/server";
import { getRuntimeEnv } from "@/platform/runtime/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  return parseChatGPTUser(new Headers(requestHeaders));
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export async function requireOwner(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath(returnTo));

  try {
    return requireAllowedOwner(
      user,
      getRuntimeEnv().OWNER_EMAIL_ALLOWLIST,
    );
  } catch (error) {
    if (error instanceof OwnerAccessError) {
      redirect(
        error.code === "owner_allowlist_unavailable"
          ? "/access-denied?reason=unavailable"
          : "/access-denied",
      );
    }
    throw error;
  }
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}
