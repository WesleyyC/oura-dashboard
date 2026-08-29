"use client";

import { useState, type FormEvent } from "react";

import type {
  HealthProfileSummary,
} from "../domain/contracts";
import type { ProfileColorKey } from "../domain/profile-colors";
import {
  CONNECTION_LABELS,
  REFRESH_ERROR_LABELS,
  formatTimestamp,
} from "../model/settings-state";
import { ProfileColorPicker } from "./ProfileColorPicker";

export interface ProfileCardProps {
  profile: HealthProfileSummary;
  index: number;
  total: number;
  setupReady: boolean;
  busyAction: string | null;
  onRename(profileId: string, displayName: string): Promise<void>;
  onColorChange(profileId: string, colorKey: ProfileColorKey): Promise<void>;
  onMove(index: number, direction: -1 | 1): Promise<void>;
  onReconnect(profileId: string): void;
  onHandoff(profileId: string): void;
  onRemove(profile: HealthProfileSummary): Promise<void>;
}

export function ProfileCard({
  profile,
  index,
  total,
  setupReady,
  busyAction,
  onRename,
  onColorChange,
  onMove,
  onReconnect,
  onHandoff,
  onRemove,
}: ProfileCardProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const waiting = busyAction !== null;
  const refreshError = profile.safeErrorCode
    ? REFRESH_ERROR_LABELS[profile.safeErrorCode]
    : null;

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = displayName.trim();
    if (!nextName || nextName === profile.displayName) return;
    void onRename(profile.id, nextName);
  }

  return (
    <article className="profile-card">
      <div className="profile-card-heading">
        <div>
          <h3>{profile.displayName}</h3>
          <span
            className="connection-status"
            data-state={
              profile.status === "connected"
                ? "connected"
                : profile.status === "disabled"
                  ? "loading"
                  : "attention"
            }
          >
            {CONNECTION_LABELS[profile.status]}
          </span>
        </div>
        <div
          className="profile-order-controls"
          aria-label={`Dashboard order for ${profile.displayName}`}
        >
          <button
            className="order-button"
            type="button"
            aria-label={`Move ${profile.displayName} up`}
            disabled={waiting || index === 0}
            onClick={() => void onMove(index, -1)}
          >
            Up
          </button>
          <button
            className="order-button"
            type="button"
            aria-label={`Move ${profile.displayName} down`}
            disabled={waiting || index === total - 1}
            onClick={() => void onMove(index, 1)}
          >
            Down
          </button>
        </div>
      </div>

      <p className="profile-meta">
        {profile.lastSucceededAt
          ? `Last refreshed ${formatTimestamp(profile.lastSucceededAt)}`
          : "No hosted refresh yet"}
        {refreshError ? ` · ${refreshError}` : ""}
      </p>

      <form className="rename-profile-form" onSubmit={submitRename}>
        <label htmlFor={`profile-name-${profile.id}`}>Display name</label>
        <div className="field-action">
          <input
            id={`profile-name-${profile.id}`}
            type="text"
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button
            className="secondary-button"
            type="submit"
            disabled={
              waiting ||
              !displayName.trim() ||
              displayName.trim() === profile.displayName
            }
          >
            Save
          </button>
        </div>
      </form>

      <ProfileColorPicker
        profileId={profile.id}
        displayName={profile.displayName}
        colorKey={profile.colorKey}
        saving={busyAction === `color:${profile.id}`}
        disabled={busyAction !== null}
        onChange={(colorKey) =>
          void onColorChange(profile.id, colorKey)
        }
      />

      <div className="profile-actions">
        <div className="connection-choice-actions profile-connection-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={!setupReady || waiting}
            onClick={() => onReconnect(profile.id)}
          >
            {busyAction === `reconnect:${profile.id}`
              ? "Opening Oura…"
              : profile.status === "pending"
                ? "Connect here"
                : "Reconnect here"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!setupReady || waiting}
            onClick={() => onHandoff(profile.id)}
          >
            {busyAction === `handoff-start:${profile.id}`
              ? "Creating link…"
              : profile.status === "pending"
                ? "Send link"
                : "Send reconnect link"}
          </button>
        </div>
        <button
          className="destructive-text-button"
          type="button"
          disabled={waiting}
          onClick={() => void onRemove(profile)}
        >
          Remove profile
        </button>
      </div>
    </article>
  );
}
