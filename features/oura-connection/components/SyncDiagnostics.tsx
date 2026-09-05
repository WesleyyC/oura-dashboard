"use client";

import { useEffect, useRef, useState } from "react";
import type { HealthProfileSummary } from "@/features/profile-management/client";
import { resolveLocalTimeZone } from "@/shared/time-zone";
import { createDiagnosticsApi, type DiagnosticsApi } from "../client/diagnostics-api";
import type { RefreshDiagnostics } from "../domain/diagnostics";

const defaultApi = createDiagnosticsApi((input, init) => fetch(input, init));
const confirmRepair = (name: string) => window.confirm(
  `Refetch six months of Oura history for ${name}? This can take several minutes. Existing data stays available.`,
);

export function SyncDiagnostics({ profiles, disabled = false, api = defaultApi, confirmRepair: confirm = confirmRepair }: {
  profiles: HealthProfileSummary[];
  disabled?: boolean;
  api?: DiagnosticsApi;
  confirmRepair?: (name: string) => boolean;
}) {
  const [report, setReport] = useState<RefreshDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const pending = useRef<AbortController | null>(null);
  const connected = profiles.filter(({ status }) => status === "connected");
  const target = connected.find(({ id }) => id === selected) ?? connected[0];
  useEffect(() => () => pending.current?.abort(), []);

  async function run(repair: boolean) {
    if (disabled || pending.current || repair && (!target || !confirm(target.displayName))) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage(repair ? "Repairing history. Existing data stays available…" : "Checking sync status…");
    try {
      if (repair) {
        const result = await api.repair(target.id, resolveLocalTimeZone(), controller.signal);
        if (controller.signal.aborted) return;
        setMessage(result.status === "refreshed" || result.status === "fresh"
          ? "History repaired. Return to the dashboard to load the updated data."
          : result.status === "already_running" ? "A refresh is already running. Check its status in a few minutes."
          : result.safeErrorCode === "authorization_required" ? "Reconnect this person's Oura account, then try again."
          : result.safeErrorCode === "configuration_missing" ? "The dashboard operator needs to check the Oura configuration before repairing history."
          : "History could not be repaired. Check sync status and try again later.");
      }
      const next = await api.load(controller.signal);
      if (controller.signal.aborted) return;
      setReport(next);
      if (!repair) setMessage("Sync status checked. Nothing is monitored in the background.");
    } catch {
      if (!controller.signal.aborted) setMessage("Sync status is unavailable. Try again. A requested repair may still be running.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (pending.current === controller) pending.current = null;
    }
  }

  return (
    <details className="account-disclosure sync-diagnostics">
      <summary>Sync diagnostics and recovery</summary>
      <p>Check sync status, timing, and record counts. This report contains no health values, emails, or credentials.</p>
      <button className="secondary-button" type="button" disabled={disabled || busy} onClick={() => run(false)}>
        Check sync status
      </button>
      <p role="status" aria-live="polite">{message}</p>
      {report ? <dl>
        {profiles.map((profile) => {
          const item = report.profiles.find(({ profileId }) => profileId === profile.id);
          return item ? <div key={profile.id}>
            <dt>{profile.displayName}</dt>
            <dd>{item.status} · Last success: {item.lastSucceededAt ? new Date(item.lastSucceededAt).toLocaleString() : "Never"}
              {item.durationMs !== null ? ` · Last attempt: ${(item.durationMs / 1000).toFixed(1)} s` : ""}
              {` · Rows in last successful refresh: ${item.lastSuccessfulRowCount}`}
              {item.safeErrorCode ? ` · ${item.safeErrorCode.replaceAll("_", " ")}` : ""}
            </dd>
          </div> : null;
        })}
      </dl> : null}
      <p>Missing older days after a sync problem? Refetch the full six-month window. Days Oura does not provide may still be empty.</p>
      <label htmlFor="repair-profile">Person to repair</label>
      <div className="field-action">
        <select id="repair-profile" value={target?.id ?? ""} disabled={disabled || busy || !connected.length} onChange={(event) => setSelected(event.target.value)}>
          {!connected.length ? <option value="">Connect Oura first</option> : null}
          {connected.map(({ id, displayName }) => <option key={id} value={id}>{displayName}</option>)}
        </select>
        <button className="secondary-button" type="button" disabled={disabled || busy || !target} onClick={() => run(true)}>
          Repair six-month history
        </button>
      </div>
    </details>
  );
}
