"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SyncDiagnostics } from "@/features/oura-connection/client";

import {
  useSettingsController,
  type SettingsController,
} from "../model/use-settings-controller";
import { OuraConnectionHandoff } from "./OuraConnectionHandoff";
import { ProfileCard } from "./ProfileCard";
import { SetupNotice } from "./SetupNotice";

export interface SettingsScreenProps {
  callbackStatus?: string;
}

interface SettingsContentProps {
  controller: SettingsController;
}

function SettingsBackLink() {
  return (
    <Link className="text-link settings-back-link" href="/">
      <ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />
      <span>Back to dashboard</span>
    </Link>
  );
}

export function SettingsScreen({ callbackStatus }: SettingsScreenProps) {
  const controller = useSettingsController(callbackStatus);
  return <SettingsContent controller={controller} />;
}

export function SettingsContent({ controller }: SettingsContentProps) {
  const {
    profiles,
    newDisplayName,
    deleteConfirmation,
    loading,
    busyAction,
    notice,
    deleted,
    handoff,
    setupReady,
    setNewDisplayName,
    setDeleteConfirmation,
    addProfile,
    addProfileHandoff,
    checkHandoff,
    cancelHandoff,
    closeHandoff,
    renameProfile,
    updateProfileColor,
    moveProfile,
    removeProfile,
    refreshAll,
    deleteAccount,
    startReconnect,
    startReconnectHandoff,
  } = controller;
  const [addPersonChoice, setAddPersonChoice] = useState<boolean | null>(null);
  const addPersonOpen = !loading && (
    addPersonChoice ?? profiles.length === 0
  );

  if (deleted) {
    return (
      <main className="settings-shell">
        <header className="settings-header">
          <SettingsBackLink />
          <h1>Dashboard data deleted</h1>
          <p>
            The health profiles, cached aggregates, and Oura connections for
            this ChatGPT account are gone.
          </p>
        </header>
        {notice ? <SetupNotice notice={notice} /> : null}
        <p className="settings-footnote">
          Opening the dashboard again will create a new, empty account.
        </p>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <SettingsBackLink />
        <h1>Settings</h1>
        <p>Manage the people connected to this dashboard.</p>
      </header>

      {notice ? <SetupNotice notice={notice} /> : null}

      {handoff ? (
        <OuraConnectionHandoff
          handoff={handoff}
          canceling={busyAction === "handoff-cancel"}
          onCancel={cancelHandoff}
          onCheck={() => checkHandoff(handoff, true)}
          onClose={closeHandoff}
        />
      ) : null}

      <section className="setup-section" aria-labelledby="connected-people">
        <div className="setup-heading connected-people-heading">
          <div>
            <h2 id="connected-people">Connected people</h2>
            <p>Manage names, colors, order, and Oura connections.</p>
          </div>
          <div className="connected-people-actions">
            <span className="profile-count">
              {profiles.length} {profiles.length === 1 ? "person" : "people"}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={
                busyAction !== null ||
                !profiles.some(({ status }) => status === "connected")
              }
              onClick={() => void refreshAll()}
            >
              {busyAction === "refresh" ? "Refreshing…" : "Refresh all"}
            </button>
            <button
              className={addPersonOpen ? "secondary-button" : "primary-button"}
              type="button"
              aria-controls="add-person-panel"
              aria-expanded={addPersonOpen}
              disabled={loading || busyAction !== null}
              onClick={() => setAddPersonChoice(!addPersonOpen)}
            >
              {addPersonOpen ? "Cancel" : "Add person"}
            </button>
          </div>
        </div>

        {addPersonOpen ? (
          <div className="add-person-panel" id="add-person-panel">
            <h3>Add a person</h3>
            <form className="add-profile-form" onSubmit={addProfile}>
              <label htmlFor="family-member-name">Display name</label>
              <p>
                Use this browser, or send a one-time link to the person you are
                adding.
              </p>
              <div className="field-action">
                <input
                  id="family-member-name"
                  name="displayName"
                  type="text"
                  autoComplete="off"
                  maxLength={80}
                  placeholder="Display name"
                  value={newDisplayName}
                  onChange={(event) => setNewDisplayName(event.target.value)}
                />
                <div className="connection-choice-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      !setupReady ||
                      !newDisplayName.trim() ||
                      busyAction !== null
                    }
                  >
                    {busyAction === "add" ? "Opening Oura…" : "Connect here"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      !setupReady ||
                      !newDisplayName.trim() ||
                      busyAction !== null
                    }
                    onClick={addProfileHandoff}
                  >
                    {busyAction === "handoff-start:add"
                      ? "Creating link…"
                      : "Send link"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}

        {loading ? (
          <p className="setup-empty" role="status">Loading connected people…</p>
        ) : profiles.length ? (
          <div className="profile-list">
            {profiles.map((profile, index) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                index={index}
                total={profiles.length}
                setupReady={setupReady}
                busyAction={busyAction}
                onRename={renameProfile}
                onColorChange={updateProfileColor}
                onMove={moveProfile}
                onReconnect={startReconnect}
                onHandoff={startReconnectHandoff}
                onRemove={removeProfile}
              />
            ))}
          </div>
        ) : !addPersonOpen ? (
          <div className="setup-empty">
            <h3>No connected people yet.</h3>
          </div>
        ) : null}
      </section>

      <section
        className="system-status"
        aria-labelledby="oura-connection"
      >
        <div>
          <h2 id="oura-connection">Oura connection</h2>
          {!loading && !setupReady ? (
            <p>App credentials are managed in Sites Settings.</p>
          ) : null}
        </div>
        <span
          className="connection-status"
          data-state={
            loading ? "loading" : setupReady ? "connected" : "attention"
          }
        >
          {loading ? "Checking" : setupReady ? "Ready" : "Setup required"}
        </span>
      </section>

      <SyncDiagnostics profiles={profiles} disabled={loading || busyAction !== null} />

      <section className="danger-zone" aria-labelledby="dashboard-account">
        <div>
          <h2 id="dashboard-account">Dashboard account</h2>
          <p>Manage data stored by Oura Dashboard.</p>
        </div>
        <details className="account-disclosure">
          <summary>Delete dashboard data</summary>
          <form onSubmit={deleteAccount}>
            <p>
              This permanently removes every profile, cached daily aggregate,
              and saved Oura connection owned by this ChatGPT account. Other
              users are unaffected.
            </p>
            <label htmlFor="delete-confirmation">
              Type <strong>DELETE</strong> to confirm
            </label>
            <div className="field-action">
              <input
                id="delete-confirmation"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
              <button
                className="danger-button"
                type="submit"
                disabled={
                  deleteConfirmation !== "DELETE" || busyAction !== null
                }
              >
                {busyAction === "delete-account"
                  ? "Deleting…"
                  : "Delete dashboard data"}
              </button>
            </div>
          </form>
        </details>
      </section>
    </main>
  );
}
