"use client";

import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/shared/ui";

type GuestState =
  | { kind: "loading" }
  | { kind: "ready"; displayName: string; expiresAt: string }
  | { kind: "starting"; displayName: string; expiresAt: string }
  | { kind: "unavailable" }
  | { kind: "failed" };

export function GuestOuraConnect() {
  const inviteRef = useRef("");
  const [state, setState] = useState<GuestState>({ kind: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const invite = params.get("invite") ?? "";
    window.history.replaceState(null, "", "/connect/oura");
    inviteRef.current = invite;

    let active = true;
    const inspection = invite
      ? guestRequest<{ displayName: string; expiresAt: string }>(
          "/api/oura/guest/inspect",
          invite,
        )
      : Promise.reject(new Error("Missing invitation"));
    void inspection.then(
      (result) => {
        if (active) setState({ kind: "ready", ...result });
      },
      () => {
        if (active) setState({ kind: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function connectOura() {
    if (state.kind !== "ready") return;
    setState({
      kind: "starting",
      displayName: state.displayName,
      expiresAt: state.expiresAt,
    });
    try {
      const { authorizationUrl } = await guestRequest<{
        authorizationUrl: string;
      }>("/api/oura/guest/authorize", inviteRef.current);
      const destination = new URL(authorizationUrl);
      if (
        destination.protocol !== "https:" ||
        destination.hostname !== "cloud.ouraring.com"
      ) {
        throw new Error("Invalid Oura destination");
      }
      window.location.assign(authorizationUrl);
    } catch {
      inviteRef.current = "";
      setState({ kind: "failed" });
    }
  }

  return (
    <main className="guest-connect-shell">
      <section className="guest-connect-card" aria-labelledby="guest-connect-title">
        <BrandMark className="guest-brand-mark" />
        <h1 id="guest-connect-title">Connect Oura</h1>
        {state.kind === "loading" ? (
          <p role="status">Checking connection link…</p>
        ) : state.kind === "unavailable" ? (
          <GuestUnavailable />
        ) : state.kind === "failed" ? (
          <>
            <p role="alert">Oura was not connected.</p>
            <p>Ask the dashboard owner for a new connection link.</p>
          </>
        ) : (
          <>
            <p>
              Connect {state.displayName}&apos;s Oura account to the family
              dashboard.
            </p>
            <p className="guest-connect-expiry">
              This link expires {formatExpiry(state.expiresAt)}.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={state.kind === "starting"}
              onClick={() => void connectOura()}
            >
              {state.kind === "starting" ? "Opening Oura…" : "Connect Oura"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function GuestUnavailable() {
  return (
    <>
      <p role="alert">This connection link is no longer available.</p>
      <p>Ask the dashboard owner for a new one.</p>
    </>
  );
}

async function guestRequest<T>(path: string, invite: string): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Guest Oura request failed");
  return response.json() as Promise<T>;
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
