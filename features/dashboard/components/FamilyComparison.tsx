"use client";

import type { CSSProperties } from "react";

import {
  METRIC_GROUPS,
  type HealthSummary,
  type MetricDefinition,
  type NumericHealthKey,
} from "@/features/health-data/client";
import {
  compareLatestToRange,
  formatMetricDifference,
  formatMetricValue,
  type MetricStatus,
} from "../presentation/health-ui";

export interface FamilyComparisonProfile {
  id: string;
  displayName: string;
  color: string;
  summary: HealthSummary;
  loading: boolean;
}

export interface FamilyComparisonSection {
  title: string;
  description: string;
  rows: Array<{
    metric: MetricDefinition;
    values: Array<{
      profileId: string;
      displayName: string;
      color: string;
      formattedValue: string;
      status: MetricStatus | null;
    }>;
    difference: { label: string; formattedValue: string } | null;
  }>;
}

export interface FamilyComparisonProps {
  profiles: FamilyComparisonProfile[];
  loading: boolean;
  selectedMetric: NumericHealthKey;
  onSelectMetric(key: NumericHealthKey): void;
}

type ProfileIdentityStyle = CSSProperties & { "--profile-color"?: string };

function profileIdentityStyle(color: string): ProfileIdentityStyle {
  return { "--profile-color": color };
}

function differenceFor(
  profiles: FamilyComparisonProfile[],
  metric: MetricDefinition,
  loading: boolean,
) {
  if (profiles.length !== 2) return null;
  const first = profiles[0].summary[metric.key].average;
  const second = profiles[1].summary[metric.key].average;
  const difference = typeof first === "number" && Number.isFinite(first)
    && typeof second === "number" && Number.isFinite(second)
    ? second - first
    : null;
  return {
    label: `${profiles[1].displayName} − ${profiles[0].displayName}`,
    formattedValue: loading ? "…" : formatMetricDifference(difference, metric.format),
  };
}

export function buildFamilyComparisonSections(
  profiles: FamilyComparisonProfile[],
  loading: boolean,
): FamilyComparisonSection[] {
  return METRIC_GROUPS.map((group) => ({
    title: group.title,
    description: group.description,
    rows: group.items.map((metric) => ({
      metric,
      values: profiles.map((profile) => {
        const summary = profile.summary[metric.key];
        return {
          profileId: profile.id,
          displayName: profile.displayName,
          color: profile.color,
          formattedValue: profile.loading
            ? "…"
            : formatMetricValue(summary.average, metric.format),
          status: compareLatestToRange(summary, metric.comparison),
        };
      }),
      difference: differenceFor(profiles, metric, loading),
    })),
  }));
}

function MetricButton({
  metric,
  selectedMetric,
  onSelectMetric,
}: Pick<FamilyComparisonProps, "selectedMetric" | "onSelectMetric"> & {
  metric: MetricDefinition;
}) {
  return (
    <button
      type="button"
      className="family-metric-button"
      data-metric-key={metric.key}
      aria-pressed={selectedMetric === metric.key}
      aria-controls="family-metric-explorer"
      onClick={() => onSelectMetric(metric.key)}
    >
      {metric.label}
    </button>
  );
}

function MetricValue({
  value,
}: {
  value: FamilyComparisonSection["rows"][number]["values"][number];
}) {
  return (
    <span className="family-comparison-value">
      <strong>{value.formattedValue}</strong>
      {value.status ? (
        <span className="metric-status" data-status={value.status.tone}>
          <span aria-hidden="true">{value.status.arrow}</span>
          Latest {value.status.label.toLowerCase()}
        </span>
      ) : null}
    </span>
  );
}

function FamilyComparisonTable({
  profiles,
  sections,
  selectedMetric,
  onSelectMetric,
}: Omit<FamilyComparisonProps, "loading"> & {
  sections: FamilyComparisonSection[];
}) {
  const hasDifference = profiles.length === 2;
  const columnCount = 1 + profiles.length + (hasDifference ? 1 : 0);
  const minWidth = 220 + profiles.length * 170 + (hasDifference ? 170 : 0);
  const style = { "--family-comparison-min-width": `${minWidth}px` } as CSSProperties;
  const scrollable = profiles.length > 3;

  return (
    <div
      className="family-comparison-desktop"
      data-overflow={scrollable ? "true" : undefined}
      style={style}
      tabIndex={scrollable ? 0 : undefined}
      aria-label={scrollable ? "Scrollable detailed family comparison" : undefined}
    >
      <table className="family-comparison-table">
        <caption>Detailed Oura averages for the selected range</caption>
        <colgroup>
          <col className="family-comparison-metric-column" />
          {profiles.map((profile) => <col key={profile.id} />)}
          {hasDifference ? <col /> : null}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {profiles.map((profile) => (
              <th scope="col" key={profile.id}>
                <span className="family-table-profile-heading">
                  <span
                    className="profile-identity-mark family-table-profile-mark"
                    style={profileIdentityStyle(profile.color)}
                    aria-hidden="true"
                  />
                  {profile.displayName}
                </span>
              </th>
            ))}
            {hasDifference ? (
              <th scope="col">
                {profiles[1].displayName} − {profiles[0].displayName}
              </th>
            ) : null}
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody key={section.title}>
            <tr className="family-metric-group-row">
              <th scope="rowgroup">
                {section.title}
                <small>{section.description}</small>
              </th>
              <td colSpan={columnCount - 1} aria-hidden="true" />
            </tr>
            {section.rows.map(({ metric, values, difference }) => (
              <tr data-selected={selectedMetric === metric.key} key={metric.key}>
                <th scope="row">
                  <MetricButton
                    metric={metric}
                    selectedMetric={selectedMetric}
                    onSelectMetric={onSelectMetric}
                  />
                </th>
                {values.map((value) => (
                  <td key={value.profileId}><MetricValue value={value} /></td>
                ))}
                {difference ? (
                  <td>
                    <span className="family-delta">{difference.formattedValue}</span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function FamilyComparisonList({
  sections,
  selectedMetric,
  onSelectMetric,
}: Pick<FamilyComparisonProps, "selectedMetric" | "onSelectMetric"> & {
  sections: FamilyComparisonSection[];
}) {
  return (
    <div className="family-comparison-list">
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`family-comparison-${section.title.toLowerCase().replaceAll(" ", "-")}`}>
          <header>
            <h3 id={`family-comparison-${section.title.toLowerCase().replaceAll(" ", "-")}`}>{section.title}</h3>
            <p>{section.description}</p>
          </header>
          {section.rows.map(({ metric, values, difference }) => (
            <div className="family-comparison-list-row" key={metric.key}>
              <MetricButton
                metric={metric}
                selectedMetric={selectedMetric}
                onSelectMetric={onSelectMetric}
              />
              <dl>
                {values.map((value) => (
                  <div className="family-comparison-profile-row" key={value.profileId}>
                    <dt className="family-comparison-profile-name">
                      <span
                        className="profile-identity-mark"
                        style={profileIdentityStyle(value.color)}
                        aria-hidden="true"
                      />
                      <span className="family-comparison-mobile-profile-name">
                        {value.displayName}
                      </span>
                    </dt>
                    <dd><MetricValue value={value} /></dd>
                  </div>
                ))}
                {difference ? (
                  <div className="family-comparison-difference">
                    <dt>{difference.label}</dt>
                    <dd>{difference.formattedValue}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function FamilyComparison({
  profiles,
  loading,
  selectedMetric,
  onSelectMetric,
}: FamilyComparisonProps) {
  const sections = buildFamilyComparisonSections(profiles, loading);
  return (
    <>
      <FamilyComparisonTable
        profiles={profiles}
        sections={sections}
        selectedMetric={selectedMetric}
        onSelectMetric={onSelectMetric}
      />
      <FamilyComparisonList
        sections={sections}
        selectedMetric={selectedMetric}
        onSelectMetric={onSelectMetric}
      />
    </>
  );
}
