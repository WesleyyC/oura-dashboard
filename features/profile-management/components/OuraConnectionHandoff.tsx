"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export interface OuraHandoff {
  profileId: string;
  displayName: string;
  connectUrl: string;
  expiresAt: string;
  profileUpdatedAt: string;
}

export function OuraConnectionHandoff({
  handoff,
  canceling,
  onCancel,
  onCheck,
  onClose,
}: {
  handoff: OuraHandoff;
  canceling: boolean;
  onCancel(): Promise<void>;
  onCheck(): Promise<void>;
  onClose(): void;
}) {
  const linkRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(handoff.connectUrl);
      setCopyState("copied");
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopyState("manual");
    }
  }

  return (
    <section
      className="oura-handoff-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="oura-handoff-title"
    >
      <div className="oura-handoff-qr" aria-hidden="true">
        <QRCodeSVG
          value={handoff.connectUrl}
          size={196}
          level="M"
          marginSize={2}
          title={`Oura connection link for ${handoff.displayName}`}
        />
      </div>
      <div className="oura-handoff-content">
        <div className="oura-handoff-heading">
          <div>
            <h2 id="oura-handoff-title">
              Connect Oura for {handoff.displayName}
            </h2>
            <p>
              Scan this code on their device, or send them the connection link.
            </p>
          </div>
          <button
            className="destructive-text-button"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <label className="oura-handoff-link">
          Connection link
          <input
            ref={linkRef}
            type="text"
            readOnly
            value={handoff.connectUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <p className="oura-handoff-expiry">
          Available until {formatExpiry(handoff.expiresAt)}.
        </p>
        <div className="oura-handoff-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => void copyLink()}
          >
            {copyState === "copied" ? "Copied" : "Copy connection link"}
          </button>
          <a className="secondary-button button-link" href={handoff.connectUrl}>
            Open on this device
          </a>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void onCheck()}
          >
            Check connection
          </button>
          <button
            className="destructive-text-button"
            type="button"
            disabled={canceling}
            onClick={() => void onCancel()}
          >
            {canceling ? "Canceling…" : "Cancel link"}
          </button>
        </div>
        <p className="oura-handoff-copy-status" role="status">
          {copyState === "copied"
            ? "Connection link copied."
            : copyState === "manual"
              ? "Select and copy the highlighted link."
              : ""}
        </p>
      </div>
    </section>
  );
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
