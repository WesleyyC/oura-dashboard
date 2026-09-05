"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { RefreshCw, Settings as SettingsIcon } from "lucide-react";

import {
  rangeWindow,
  selectRange,
  type RangeKey,
} from "@/features/health-data/client";
import { profileColorCssValue } from "@/features/profile-management/client";
import { BrandMark, DashboardSelector } from "@/shared/ui";
import {
  coversHealthWindow,
  profileRefreshStatus,
} from "../model/dashboard-state";
import {
  type DashboardController,
  useDashboardController,
} from "../model/use-dashboard-controller";
import {
  RANGES,
  summarizeDashboardRefresh,
} from "../presentation/health-ui";
import type { FamilyHealthView as FamilyViewComponent } from "./FamilyHealthView";
import { IndividualHealthView } from "./IndividualHealthView";

function FamilyHealthView(props: ComponentProps<typeof FamilyViewComponent>) {
  const [View, setView] = useState<typeof FamilyViewComponent | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void import("./FamilyHealthView").then(
      (module) => { if (active) setView(() => module.FamilyHealthView); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, []);
  return View ? <View {...props} /> : <section className="notice" role={failed ? "alert" : "status"}>
    <p>{failed ? "Family view could not be loaded." : "Loading Family view…"}</p>
    {failed ? <button className="secondary-button" type="button" onClick={() => window.location.reload()}>Reload page</button> : null}
  </section>;
}

export function DashboardScreen({
  initialView = "",
}: {
  initialView?: string;
}) {
  const controller = useDashboardController(initialView);
  return <DashboardContent controller={controller} />;
}

export function DashboardContent({
  controller,
}: {
  controller: DashboardController;
}) {
  const {
    view,
    range,
    profiles,
    profilesLoading,
    profileListError,
    now,
    today,
    timeZone,
    setRange,
    changeView,
    refreshProfiles,
    retryProfiles,
  } = controller;
  const visibleCounts = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((profile) => [
          profile.profile.id,
          selectRange(profile.records, range, today).length,
        ]),
      ),
    [profiles, range, today],
  );
  const selectedProfile =
    view === "family"
      ? null
      : profiles.find(({ profile }) => profile.slug === view) ?? null;
  const selectedWindow = rangeWindow(range, today);
  const displayProfiles = profiles.map((profile) => {
    const covered = coversHealthWindow(profile, selectedWindow);
    return {
      ...profile,
      records: covered ? profile.records : [],
      loading: profile.loading || !covered,
      error: profile.error ?? (!covered ? profile.historyError : null),
    };
  });
  const displaySelectedProfile = selectedProfile
    ? displayProfiles.find(
        ({ profile }) => profile.id === selectedProfile.profile.id,
      ) ?? null
    : null;
  const activeProfiles =
    view === "family"
      ? profiles
      : selectedProfile
        ? [selectedProfile]
        : [];
  const manualRefreshTargets = activeProfiles.filter(
    ({ profile }) => profile.status === "connected",
  );
  const manuallyRefreshing = manualRefreshTargets.some(
    ({ refreshing }) => refreshing,
  );
  const refreshLabel = view === "family"
    ? "Refresh all connected profiles from Oura"
    : selectedProfile
      ? `Refresh ${selectedProfile.profile.displayName} from Oura`
      : "Refresh Oura data";
  const loadingActiveData = activeProfiles.some(
    (profile) => profile.loading && !profile.records.length,
  );
  const controlMessage = profilesLoading
    ? "Loading profiles…"
    : loadingActiveData
      ? "Loading data…"
      : !profiles.length
        ? "No profiles connected"
        : selectedProfile && !visibleCounts[selectedProfile.profile.id]
          ? "No data in this range"
          : selectedProfile || view === "family"
            ? null
            : "No profile selected";
  const refreshSummary = summarizeDashboardRefresh(
    activeProfiles.map((state) => ({
      displayName: state.profile.displayName,
      status: profileRefreshStatus(state, now),
      refreshing: state.refreshing,
      updatedAt: state.updatedAt,
    })),
    view === "family",
    timeZone,
  );
  const profileSelectorOptions = profiles.length
    ? [
        ...profiles.map(({ profile }) => ({
          value: profile.slug,
          label: profile.displayName,
          color: profileColorCssValue(profile.colorKey),
        })),
        ...(profiles.length > 1
          ? [{ value: "family", label: "Family" }]
          : []),
      ]
    : [{ value: "", label: profilesLoading ? "Loading" : "None" }];
  const rangeSelectorOptions = RANGES.map(({ key, label }) => ({
    value: key,
    label,
  }));

  return (
    <main className="dashboard-shell">
      <header className="site-header">
        <h1 className="dashboard-brand-title">
          <BrandMark className="dashboard-brand-mark" />
          <span>Oura Dashboard</span>
        </h1>
        <div className="dashboard-utility">
          <div
            className="dashboard-status"
            data-state={refreshSummary.state}
            role={refreshSummary.state === "stale" ? "alert" : "status"}
          >
            <span className="dashboard-status-dot" aria-hidden="true" />
            <span className="dashboard-status-copy">
              <strong>{refreshSummary.label}</strong>
              {refreshSummary.detail ? (
                <small className="dashboard-status-detail">
                  {refreshSummary.detail}
                </small>
              ) : null}
            </span>
          </div>
          <button
            className="dashboard-refresh-button"
            type="button"
            aria-label={refreshLabel}
            title={refreshLabel}
            aria-busy={manuallyRefreshing}
            data-refreshing={manuallyRefreshing ? "true" : "false"}
            disabled={!manualRefreshTargets.length || manuallyRefreshing}
            onClick={() => void refreshProfiles(manualRefreshTargets, true)}
          >
            <RefreshCw aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <a
            className="settings-link settings-button"
            href="/settings"
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon aria-hidden="true" size={18} strokeWidth={2} />
          </a>
        </div>
      </header>

      <div className="control-bar">
        <div className="dashboard-selector-group">
          <DashboardSelector
            id="person"
            label="Person"
            value={view}
            options={profileSelectorOptions}
            disabled={profilesLoading || !profiles.length}
            onChange={changeView}
          />
          <DashboardSelector
            id="range"
            label="Range"
            value={range}
            options={rangeSelectorOptions}
            onChange={(value) => setRange(value as RangeKey)}
          />
        </div>
        {controlMessage ? (
          <p className="control-meta">{controlMessage}</p>
        ) : null}
      </div>

      {profilesLoading ? (
        <section
          className="dashboard-loading-shell"
          role="status"
          aria-label="Loading profiles"
        >
          <p className="visually-hidden">
            Loading profiles. Cached health data will appear first.
          </p>
          <dl
            className="score-strip score-strip-placeholder"
            aria-hidden="true"
          >
            {["Readiness", "Sleep", "Activity"].map((label) => (
              <div className="score-item" key={label}>
                <dt>{label}</dt>
                <dd>—</dd>
                <span className="placeholder-line" />
              </div>
            ))}
          </dl>
        </section>
      ) : profileListError ? (
        <section className="notice error-notice">
          <div>
            <h2>Profiles unavailable</h2>
            <p>{profileListError}</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      ) : !profiles.length ? (
        <section className="dashboard-empty">
          <h2>Connect your first Oura profile</h2>
          <p>Add a person in Settings, then connect their Oura account.</p>
          <a className="primary-link" href="/settings">
            Open Settings
          </a>
        </section>
      ) : view === "family" ? (
        <FamilyHealthView
          range={range}
          today={today}
          profiles={displayProfiles}
          onRetry={retryProfiles}
        />
      ) : displaySelectedProfile ? (
        <IndividualHealthView
          profileId={displaySelectedProfile.profile.id}
          displayName={displaySelectedProfile.profile.displayName}
          colorKey={displaySelectedProfile.profile.colorKey}
          range={range}
          records={displaySelectedProfile.records}
          loading={displaySelectedProfile.loading}
          error={displaySelectedProfile.error}
          today={today}
          onRetry={retryProfiles}
        />
      ) : null}
    </main>
  );
}
