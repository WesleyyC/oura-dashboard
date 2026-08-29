import type { Metadata } from "next";

import { BrandMark } from "@/shared/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Oura connection",
  description: "Oura connection result.",
  robots: { index: false, follow: false },
};

interface GuestCompletionPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GuestCompletionPage({
  searchParams,
}: GuestCompletionPageProps) {
  const params = searchParams ? await searchParams : {};
  const value = Array.isArray(params.status) ? params.status[0] : params.status;
  const result = completionResult(value);

  return (
    <main className="guest-connect-shell">
      <section className="guest-connect-card" aria-labelledby="guest-complete-title">
        <BrandMark className="guest-brand-mark" />
        <h1 id="guest-complete-title">{result.heading}</h1>
        <p>{result.message}</p>
      </section>
    </main>
  );
}

function completionResult(status: string | undefined) {
  switch (status) {
    case "connected":
      return {
        heading: "Oura is connected",
        message: "You can close this window.",
      };
    case "denied":
      return {
        heading: "Oura was not connected",
        message: "You can close this window or ask for a new link.",
      };
    case "connection_failed":
      return {
        heading: "Oura could not be connected",
        message: "Ask the dashboard owner for a new link.",
      };
    default:
      return {
        heading: "Connection link unavailable",
        message: "Ask the dashboard owner for a new one.",
      };
  }
}
