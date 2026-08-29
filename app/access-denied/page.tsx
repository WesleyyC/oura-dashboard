import type { Metadata } from "next";

import { BrandMark } from "@/shared/ui";
import { chatGPTSignOutPath } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard access",
  description: "Oura Dashboard access status.",
  robots: { index: false, follow: false },
};

interface AccessDeniedPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AccessDeniedPage({
  searchParams,
}: AccessDeniedPageProps) {
  const params = searchParams ? await searchParams : {};
  const rawReason = Array.isArray(params.reason)
    ? params.reason[0]
    : params.reason;
  const unavailable = rawReason === "unavailable";

  return (
    <main className="guest-connect-shell">
      <section className="guest-connect-card" aria-labelledby="access-title">
        <BrandMark className="guest-brand-mark" />
        <h1 id="access-title">
          {unavailable
            ? "Dashboard access is temporarily unavailable"
            : "This ChatGPT account is not approved for Oura Dashboard"}
        </h1>
        <p>
          {unavailable
            ? "Please try again later."
            : "Sign out and use an approved ChatGPT account."}
        </p>
        <a
          className="primary-button button-link"
          href={chatGPTSignOutPath("/")}
        >
          Sign out of ChatGPT
        </a>
      </section>
    </main>
  );
}
