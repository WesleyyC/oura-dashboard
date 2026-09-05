"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";

import {
  METRIC_GROUPS,
  metricDefinition,
  rangeDateTicks,
  rangeWindow,
  selectRange,
  summarize,
  trendWindowDays,
  type DailyHealthRecord,
  type HealthSummary,
  type MetricGroupDefinition,
  type NumericHealthKey,
  type RangeKey,
} from "@/features/health-data/client";
import {
  profileColorCssValue,
  type ProfileColorKey,
} from "@/features/profile-management/client";
import { MetricTrendChart } from "./MetricTrendChart";
import { ScoreTrendPanel } from "./ScoreTrendPanel";
import { ChartDateSelectionGroup } from "./ChartDateSelection";
import {
  buildTrendPoints,
  compareLatestToRange,
  familyScoreTicks,
  formatDate,
  formatMetricRange,
  formatMetricValue,
  formatScore,
  RANGES,
  scoreTrendDomain,
} from "../presentation/health-ui";

type ScoreKey = "sleep" | "readiness" | "activity";
type ScoreSummaryKey = "sleepScore" | "readinessScore" | "activityScore";

interface ScoreSeries {
  key: ScoreKey;
  summaryKey: ScoreSummaryKey;
  label: string;
}

const SCORE_SERIES: ScoreSeries[] = [
  { key: "readiness", summaryKey: "readinessScore", label: "Readiness" },
  { key: "sleep", summaryKey: "sleepScore", label: "Sleep" },
  { key: "activity", summaryKey: "activityScore", label: "Activity" },
];

function MetricGroup({
  group,
  summary,
  loading,
  selectedMetric,
  onSelect,
}: {
  group: MetricGroupDefinition;
  summary: HealthSummary;
  loading: boolean;
  selectedMetric: NumericHealthKey;
  onSelect(key: NumericHealthKey): void;
}) {
  return (
    <section className="metric-group" data-tone={group.tone} aria-labelledby={`metric-${group.tone}`}>
      <header>
        <span className="metric-group-mark" aria-hidden="true" />
        <div>
          <h3 id={`metric-${group.tone}`}>{group.title}</h3>
          <p>{group.description}</p>
        </div>
      </header>
      <div className="metric-list">
        {group.items.map((item) => {
          const metric = summary[item.key];
          const observed = formatMetricRange(metric.minimum, metric.maximum, item.format);
          const status = compareLatestToRange(metric, item.comparison);
          return (
            <button
              type="button"
              className="metric-row"
              aria-pressed={selectedMetric === item.key}
              aria-controls="individual-metric-explorer"
              onClick={() => onSelect(item.key)}
              key={item.key}
            >
              <span className="metric-row-main">
                <span className="metric-row-label">{item.label}</span>
                <small>{metric.count ? `${metric.count} days${observed ? ` · ${observed}` : ""}` : "No measurements"}</small>
              </span>
              <span className="metric-row-value">
                <strong>{loading ? "…" : formatMetricValue(metric.average, item.format)}</strong>
                {status ? (
                  <span className="metric-status" data-status={status.tone}>
                    <span aria-hidden="true">{status.arrow}</span>
                    Latest {status.label.toLowerCase()}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface IndividualHealthViewProps {
  profileId: string;
  displayName: string;
  colorKey: ProfileColorKey;
  range: RangeKey;
  records: DailyHealthRecord[];
  loading: boolean;
  error: string | null;
  today: string;
  onRetry(): void;
}

export function IndividualHealthView({
  profileId,
  displayName,
  colorKey,
  range,
  records,
  loading,
  error,
  today,
  onRetry,
}: IndividualHealthViewProps) {
  const [selectedMetric, setSelectedMetric] = useState<NumericHealthKey>("totalSleepMinutes");
  const visible = useMemo(() => selectRange(records, range, today), [records, range, today]);
  const summary = useMemo(() => summarize(visible), [visible]);
  const windowDays = trendWindowDays(range);
  const trend = useMemo(
    () => buildTrendPoints(visible, windowDays),
    [visible, windowDays],
  );
  const trendDomain = useMemo(
    () => scoreTrendDomain(
      trend.flatMap((point) => [point.readiness, point.sleep, point.activity]),
    ),
    [trend],
  );
  const trendTicks = useMemo(() => familyScoreTicks(trendDomain), [trendDomain]);
  const window = rangeWindow(range, today);
  const dateTicks = rangeDateTicks(range, today).map(formatDate);
  const selectedRange = RANGES.find((item) => item.key === range)?.label ?? "Selected range";
  const selectedRangeAverage = selectedRange === "Quarter"
    ? "Quarter average"
    : `${selectedRange.replace(" days", "-day").replace(" months", "-month")} average`;
  const selectedDefinition = metricDefinition(selectedMetric);
  const trendTreatment = windowDays === 7 ? "7-day moving average" : "Daily scores";
  const profileColor = profileColorCssValue(colorKey);

  return (
    <ChartDateSelectionGroup key={`${profileId}:${range}`}>
      {error ? (
        <section className="notice error-notice" aria-labelledby="individual-load-error-title">
          <div><h2 id="individual-load-error-title">{displayName}&apos;s data is unavailable</h2><p>{error}</p></div>
          <button type="button" className="secondary-button" onClick={onRetry}>Try again</button>
        </section>
      ) : null}

      <section aria-labelledby="score-heading">
        <h2 id="score-heading" className="visually-hidden">Latest scores and range averages</h2>
        <dl className="score-strip" aria-busy={loading}>
          {SCORE_SERIES.map((series) => {
            const value = summary[series.summaryKey];
            const status = compareLatestToRange(value, "higher");
            return (
              <div className="score-item" data-tone={series.key} data-status={status?.tone} key={series.key}>
                <dt>{series.label}</dt>
                <dd>{loading ? "…" : formatScore(value.latest)}</dd>
                <p>{value.count ? `${formatScore(value.average)} ${selectedRangeAverage.toLowerCase()} · ${value.count} measured ${value.count === 1 ? "day" : "days"}` : "No measurements"}</p>
                {status ? (
                  <span className="metric-status score-status" data-status={status.tone}>
                    <span aria-hidden="true">{status.arrow}</span>{status.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </dl>
      </section>

      <section className="trend-section" aria-labelledby="trend-title">
        <div className="section-heading">
          <div><h2 id="trend-title">Score trends</h2><p>{selectedRange} · absolute Oura scores</p></div>
        </div>
        <p className="chart-explainer">{trendTreatment}. Hover, tap, or use arrow keys to select a date and see its score.</p>
        <div className="score-trend-panels">
          {SCORE_SERIES.map((series) => (
            <ScoreTrendPanel
              id={`score-${series.key}`}
              label={series.label}
              valueKey={series.key}
              points={trend}
              domain={trendDomain}
              ticks={trendTicks}
              window={window}
              dateTicks={dateTicks}
              treatment={trendTreatment}
              seriesLabel={displayName}
              seriesColor={profileColor}
              loading={loading}
              key={`${series.key}-${range}`}
            />
          ))}
        </div>
      </section>

      <section className="metrics-report" aria-labelledby="metrics-title">
        <header className="report-heading"><div><h2 id="metrics-title">Health averages</h2><p>{selectedRange} · select a metric to update the chart</p></div></header>
        <MetricTrendChart
          id="individual-metric-explorer"
          metric={selectedDefinition}
          range={range}
          today={today}
          loading={loading}
          series={[{
            id: "individual",
            label: displayName,
            records: visible,
            average: summary[selectedMetric].average,
            loading,
            identity: {
              type: "person",
              profileId,
              color: profileColor,
            },
          }]}
        />
        <div className="metric-groups">
          {METRIC_GROUPS.map((group) => (
            <MetricGroup
              group={group}
              summary={summary}
              loading={loading}
              selectedMetric={selectedMetric}
              onSelect={setSelectedMetric}
              key={group.title}
            />
          ))}
        </div>
      </section>

      <DailyDetails records={visible} />

    </ChartDateSelectionGroup>
  );
}

function DailyDetails({ records }: { records: DailyHealthRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  const [Table, setTable] = useState<ComponentType<{ records: DailyHealthRecord[] }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!expanded || Table) return;
    let active = true;
    void import("./DailyDetailsTable").then(
      (module) => { if (active) setTable(() => module.default); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [expanded, Table, retry]);
  return (
    <details className="daily-details" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary><span>Daily details</span><span>{records.length} days</span></summary>
      {expanded ? Table ? <Table records={records} /> : failed ?
        <p role="alert">Daily details could not be loaded. <button className="secondary-button" type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>Try again</button></p>
        : <p role="status">Loading daily details…</p> : null}
    </details>
  );
}
