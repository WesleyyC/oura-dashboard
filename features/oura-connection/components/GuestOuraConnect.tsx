"use client";

import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/shared/ui";
import { abortable, withDeadline } from "@/shared/abortable";

type GuestState =
  | { kind: "loading" }
  | { kind: "ready"; displayName: string; expiresAt: string }
  | { kind: "starting"; displayName: string; expiresAt: string }
  | { kind: "unavailable" }
  | { kind: "failed" };

export function GuestOuraConnect() {
  const inviteRef = useRef("");
  const requestController = useRef<AbortController | null>(null);
  const [state, setState] = useState<GuestState>({ kind: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const invite = inviteRef.current || params.get("invite") || "";
    window.history.replaceState(null, "", "/connect/oura");
    inviteRef.current = invite;
    const controller = new AbortController();
    requestController.current = controller;

    let active = true;
    const inspection = invite
      ? guestRequest<{ displayName: string; expiresAt: string }>(
          "/api/oura/guest/inspect",
          invite,
          controller.signal,
        )
      : Promise.reject(new Error("Missing invitation"));
    void inspection.then(
      (result) => {
        if (!active) return;
        if (typeof result?.displayName !== "string" || !result.displayName.trim() || result.displayName.length > 80 ||
          typeof result.expiresAt !== "string" || !(Date.parse(result.expiresAt) > Date.now())) {
          setState({ kind: "unavailable" });
          return;
        }
        setState({ kind: "ready", displayName: result.displayName, expiresAt: result.expiresAt });
      },
      () => {
        if (active) setState({ kind: "unavailable" });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function connectOura() {
    if (state.kind !== "ready") return;
    if (Date.parse(state.expiresAt) <= Date.now()) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({
      kind: "starting",
      displayName: state.displayName,
      expiresAt: state.expiresAt,
    });
    try {
      const { authorizationUrl } = await guestRequest<{
        authorizationUrl: string;
      }>("/api/oura/guest/authorize", inviteRef.current, requestController.current?.signal);
      if (requestController.current?.signal.aborted) return;
      const destination = new URL(authorizationUrl);
      if (
        destination.protocol !== "https:" ||
        destination.hostname !== "cloud.ouraring.com"
      ) {
        throw new Error("Invalid Oura destination");
      }
      window.location.assign(authorizationUrl);
    } catch {
      if (requestController.current?.signal.aborted) return;
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
            <div className="guest-sharing-notice">
              <h2>What you are sharing</h2>
              <p>The dashboard owner can view your daily sleep, readiness, activity, body signals, stress, and workout summaries.</p>
              <p>Up to six months of history is fetched initially. New data can be refreshed while you stay connected. This does not give you access to anyone else&apos;s dashboard.</p>
              <h2>You stay in control</h2>
              <p>Revoke access in your Oura account to stop future refreshes. Ask the dashboard owner to remove your profile to delete its cached data. Backups are managed separately by the operator.</p>
              <p>Only connect if you know and trust the person who sent this link.</p>
            </div>
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

async function guestRequest<T>(path: string, invite: string, signal?: AbortSignal): Promise<T> {
  return withDeadline(async (deadline) => {
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const response = await abortable(fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite }),
      cache: "no-store",
      signal: combined,
    }), combined);
    if (!response.ok) throw new Error("Guest Oura request failed");
    return abortable(response.json() as Promise<T>, combined);
  }, 30_000);
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
