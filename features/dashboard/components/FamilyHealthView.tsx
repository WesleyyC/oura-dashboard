"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import {
  buildFamilyTrend,
  metricDefinition,
  rangeDateTicks,
  rangeWindow,
  selectRange,
  summarize,
  summarizeFamilyScore,
  trendWindowDays,
  type DailyHealthRecord,
  type FamilyScoreKey,
  type HealthSummary,
  type NumericHealthKey,
  type RangeKey,
} from "@/features/health-data/client";
import {
  profileColorCssValue,
  type HealthProfileSummary,
} from "@/features/profile-management/client";
import {
  ChartDateReadout,
  ChartDateSelection,
  ChartDateSelectionGroup,
} from "./ChartDateSelection";
import { FamilyComparison } from "./FamilyComparison";
import { MetricTrendChart } from "./MetricTrendChart";
import { CHART_WIDTH, chartLinePath, createChartScale } from "../presentation/chart-geometry";
import { ChartCrosshair, ChartDateAxis, ChartMarker, ChartMessage, ChartYAxis } from "./ChartPrimitives";
import {
  familyScoreDomain,
  familyScoreTicks,
  formatDate,
  formatScore,
  RANGES,
} from "../presentation/health-ui";

const FAMILY_SERIES: Array<{ key: FamilyScoreKey; label: string }> = [
  { key: "readinessScore", label: "Readiness" },
  { key: "sleepScore", label: "Sleep" },
  { key: "activityScore", label: "Activity" },
];

const CHART_HEIGHT = 220;

export interface FamilyProfileData {
  profile: HealthProfileSummary;
  records: DailyHealthRecord[];
  loading: boolean;
  error: string | null;
}

interface VisibleFamilyProfile extends FamilyProfileData {
  visibleRecords: DailyHealthRecord[];
  summary: HealthSummary;
  color: string;
}

interface FamilyHealthViewProps {
  range: RangeKey;
  today: string;
  profiles: FamilyProfileData[];
  onRetry(): void;
}

type SeriesStyle = CSSProperties & { "--series-color"?: string };

function profileStyle(color: string): SeriesStyle {
  return { "--series-color": color };
}

function formatScoreDifference(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const formatted = Number.isInteger(normalized)
    ? normalized.toFixed(0)
    : normalized.toFixed(1);
  return normalized > 0 ? `+${formatted}` : formatted.replace("-", "−");
}

function FamilyScorePanel({
  score,
  profiles,
  windowDays,
  loading,
  range,
  today,
}: {
  score: { key: FamilyScoreKey; label: string };
  profiles: VisibleFamilyProfile[];
  windowDays: number;
  loading: boolean;
  range: RangeKey;
  today: string;
}) {
  const scoreProfiles = useMemo(
    () =>
      profiles.map(({ profile, visibleRecords }) => ({
        profileId: profile.id,
        records: visibleRecords,
      })),
    [profiles],
  );
  const trend = useMemo(
    () => buildFamilyTrend(scoreProfiles, score.key, windowDays),
    [score.key, scoreProfiles, windowDays],
  );
  const summary = useMemo(
    () => summarizeFamilyScore(scoreProfiles, score.key),
    [score.key, scoreProfiles],
  );
  const domain = useMemo(
    () =>
      familyScoreDomain(
        trend.flatMap((point) => Object.values(point.values)),
      ),
    [trend],
  );
  const ticks = useMemo(() => familyScoreTicks(domain), [domain]);
  const chartY = createChartScale(domain, CHART_HEIGHT, { clamp: true });
  const window = rangeWindow(range, today);
  const dateTicks = rangeDateTicks(range, today).map(formatDate);
  const id = `family-${score.key}`;
  const treatment = windowDays === 7 ? "7-day moving average" : "Daily scores";
  const differenceLabel =
    profiles.length === 2
      ? `${profiles[1].profile.displayName} − ${profiles[0].profile.displayName}`
      : null;
  const profileNames = profiles.map(({ profile }) => profile.displayName);
  const hasSelectableValues = trend.some((point) =>
    profiles.some(({ profile, loading: profileLoading }) => {
      const value = point.values[profile.id];
      return !profileLoading && value !== null && Number.isFinite(value);
    })
  );

  // Keep data-derived markup outside the selection render callback. Moving a
  // crosshair should not rebuild every path and accessible table row.
  const chart = (
    <svg
      className="family-line-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      role={trend.length ? "img" : undefined}
      aria-labelledby={
        trend.length
          ? `${id}-chart-title ${id}-chart-description`
          : undefined
      }
      aria-hidden={trend.length ? undefined : true}
    >
      {trend.length ? (
        <>
          <title id={`${id}-chart-title`}>
            {`${score.label} scores for ${joinNames(profileNames)}`}
          </title>
          <desc id={`${id}-chart-description`}>
            {`${treatment}. Visible absolute scores from ${domain.minimum} to ${domain.maximum}. Every profile shares this scale. Missing measurements create gaps in each line.`}
          </desc>
        </>
      ) : null}
      {ticks.map((tick) => (
        <line
          className="family-chart-guide"
          x1="0"
          x2={CHART_WIDTH}
          y1={chartY(tick)}
          y2={chartY(tick)}
          key={tick}
        />
      ))}
      {profiles.map(({ profile, color }) => (
        <path
          className="family-chart-series"
          data-profile-id={profile.id}
          d={chartLinePath(trend, (point) => point.values[profile.id], chartY, window)}
          style={profileStyle(color)}
          key={profile.id}
        />
      ))}
    </svg>
  );
  const dataTable = (
    <table className="visually-hidden">
      <caption>{score.label} comparison chart data</caption>
      <thead>
        <tr>
          <th>Date</th>
          {profiles.map(({ profile }) => (
            <th key={profile.id}>{profile.displayName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trend.map((point) => (
          <tr key={point.date}>
            <th>{point.label}</th>
            {profiles.map(({ profile }) => (
              <td key={profile.id}>
                {formatScore(point.values[profile.id] ?? null)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartDateSelection
      points={trend}
      window={window}
      loading={loading && !hasSelectableValues}
      hasValues={hasSelectableValues}
      ariaLabel={`${score.label} scores by date`}
      ariaValueText={(point) => point
        ? [
            point.label,
            ...profiles.map(({ profile, loading: profileLoading }) => (
              profileLoading
                ? `${profile.displayName} ${score.label} loading`
                : `${profile.displayName} ${score.label} ${formatScore(
                    point.values[profile.id] ?? null,
                  )}`
            )),
          ].join(", ")
        : `No ${score.label.toLowerCase()} scores`}
    >
      {({ activePoint, activePosition, surfaceProps }) => (
        <section className="family-score-panel" aria-labelledby={`${id}-title`}>
          <header className="family-score-heading">
            <div>
              <h3 id={`${id}-title`}>{score.label}</h3>
              <p>
                Chart scale {domain.minimum}–{domain.maximum} · {treatment}
              </p>
            </div>
            <dl
              className="family-score-summary"
              role="group"
              aria-label={`${score.label} chart legend`}
            >
              {profiles.map(({ profile, color, loading: profileLoading }) => (
                <div className="family-score-legend-item" key={profile.id}>
                  <dt>
                    <i
                      className="chart-legend-line"
                      style={profileStyle(color)}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{profile.displayName}</strong>
                      <small>Range average</small>
                    </span>
                  </dt>
                  <dd>
                    {profileLoading
                      ? "…"
                      : formatScore(summary.averages[profile.id] ?? null)}
                  </dd>
                </div>
              ))}
              {differenceLabel ? (
                <div className="family-score-fact">
                  <dt>{differenceLabel}</dt>
                  <dd>
                    {loading ? "…" : formatScoreDifference(summary.difference)}
                  </dd>
                </div>
              ) : null}
              <div className="family-score-fact">
                <dt>Shared days</dt>
                <dd>{loading ? "…" : summary.pairedDays}</dd>
              </div>
            </dl>
          </header>

          <ChartDateReadout
            className="family-score-date-readout"
            date={activePoint?.label ?? "No date"}
            values={profiles.map(({ profile, color, loading: profileLoading }) => ({
              id: profile.id,
              label: profile.displayName,
              value: profileLoading
                ? "…"
                : formatScore(activePoint?.values[profile.id] ?? null),
              color,
            }))}
          />

          <div className="family-chart-frame" aria-busy={loading}>
            <ChartYAxis className="family-y-axis" ticks={[...ticks].reverse()} domain={domain} />
            <div
              className="family-chart-plot chart-selection-surface"
              {...surfaceProps}
            >
              {chart}
              {activePoint && hasSelectableValues ? (
                <ChartCrosshair position={activePosition}>
                  {profiles.map(({ profile, color, loading: profileLoading }) => {
                    const value = activePoint.values[profile.id] ?? null;
                    if (profileLoading || value === null || !Number.isFinite(value)) {
                      return null;
                    }
                    return (
                      <ChartMarker
                        position={(chartY(value) / CHART_HEIGHT) * 100}
                        data-profile-id={profile.id}
                        style={profileStyle(color)}
                        key={profile.id}
                      />
                    );
                  })}
                </ChartCrosshair>
              ) : null}
              {!loading && !trend.length ? (
                <ChartMessage>
                  This comparison will appear after family profiles have data.
                </ChartMessage>
              ) : null}
            </div>
            <ChartDateAxis className="chart-date-axis family-date-axis" labels={dateTicks} />
          </div>

          {trend.length ? dataTable : null}
        </section>
      )}
    </ChartDateSelection>
  );
}

export function FamilyHealthView({
  range,
  today,
  profiles,
  onRetry,
}: FamilyHealthViewProps) {
  const [selectedMetric, setSelectedMetric] =
    useState<NumericHealthKey>("totalSleepMinutes");
  const visibleProfiles = useMemo<VisibleFamilyProfile[]>(
    () =>
      profiles.map((item) => {
        const { profile } = item;
        const visibleRecords = selectRange(item.records, range, today);
        return {
          ...item,
          visibleRecords,
          summary: summarize(visibleRecords),
          color: profileColorCssValue(profile.colorKey),
        };
      }),
    [profiles, range, today],
  );
  const selectedDefinition = metricDefinition(selectedMetric);
  const selectedRange =
    RANGES.find((item) => item.key === range)?.label ?? "Selected range";
  const windowDays = trendWindowDays(range);
  const loading = profiles.some((profile) => profile.loading);
  const failures = profiles
    .filter(({ error }) => error)
    .map(({ profile, error }) => `${profile.displayName}: ${error}`);

  return (
    <ChartDateSelectionGroup key={range}>
      {failures.length ? (
        <section
          className="notice error-notice"
          aria-labelledby="family-load-error-title"
        >
          <div>
            <h2 id="family-load-error-title">
              Some family data is unavailable
            </h2>
            <p>
              {failures.join(" · ")} Available data stays visible; missing
              comparisons show as em dashes.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={onRetry}
          >
            Try again
          </button>
        </section>
      ) : null}

      <section className="family-report" aria-labelledby="family-title">
        <header className="family-report-heading">
          <div>
            <h2 id="family-title">Family trends</h2>
            <p>{selectedRange} · shared scale within each chart</p>
          </div>
        </header>
        <p className="chart-explainer family-explainer">
          Each chart uses its own focused scale. Every family profile shares
          that scale within the chart.
        </p>

        <div className="family-score-panels">
          {FAMILY_SERIES.map((score) => (
            <FamilyScorePanel
              key={score.key}
              score={score}
              profiles={visibleProfiles}
              windowDays={windowDays}
              loading={loading}
              range={range}
              today={today}
            />
          ))}
        </div>

        <section
          className="family-detailed"
          aria-labelledby="family-detailed-title"
        >
          <header className="report-heading family-detailed-heading">
            <div>
              <h2 id="family-detailed-title">Health comparison</h2>
              <p>
                {selectedRange} · select a metric to compare trends and
                selected-range averages
              </p>
            </div>
          </header>

          <MetricTrendChart
            id="family-metric-explorer"
            metric={selectedDefinition}
            range={range}
            today={today}
            loading={loading}
            series={visibleProfiles.map(
              ({ profile, visibleRecords, summary, color, loading: profileLoading }) => ({
                id: profile.id,
                label: profile.displayName,
                records: visibleRecords,
                average: summary[selectedMetric].average,
                loading: profileLoading,
                identity: {
                  type: "person" as const,
                  profileId: profile.id,
                  color,
                },
              }),
            )}
          />

          <FamilyComparison
            profiles={visibleProfiles.map(
              ({ profile, color, summary, loading: profileLoading }) => ({
                id: profile.id,
                displayName: profile.displayName,
                color,
                summary,
                loading: profileLoading,
              }),
            )}
            loading={loading}
            selectedMetric={selectedMetric}
            onSelectMetric={setSelectedMetric}
          />
        </section>
      </section>

      <footer className="privacy-note">
        <div className="privacy-mark" aria-hidden="true">●</div>
        <div>
          <h2>About comparisons</h2>
          <p>Profiles stay separate, and missing values remain missing.</p>
        </div>
      </footer>
    </ChartDateSelectionGroup>
  );
}

function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? "family profiles";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}
