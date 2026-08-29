"use client";

import type { CSSProperties } from "react";

import {
  dateRangePosition,
  type DateRangeWindow,
} from "@/features/health-data/client";
import {
  formatScore,
  type ChartDomain,
  type TrendPoint,
} from "../presentation/health-ui";
import { ChartDateSelection } from "./ChartDateSelection";

type ScoreTrendKey = "readiness" | "sleep" | "activity";

const CHART_WIDTH = 1_000;
const CHART_HEIGHT = 180;

type SeriesStyle = CSSProperties & { "--series-color"?: string };

function chartY(value: number, domain: ChartDomain): number {
  return ((domain.maximum - value) / (domain.maximum - domain.minimum)) * CHART_HEIGHT;
}

function linePath(
  points: TrendPoint[],
  key: ScoreTrendKey,
  domain: ChartDomain,
  window: DateRangeWindow,
): string {
  let continues = false;
  return points.map((point) => {
    const value = point[key];
    if (value === null) {
      continues = false;
      return "";
    }
    const command = continues ? "L" : "M";
    continues = true;
    const x = dateRangePosition(point.date, window) * CHART_WIDTH;
    return `${command}${x.toFixed(1)} ${chartY(value, domain).toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

interface ScoreTrendPanelProps {
  id: string;
  label: string;
  valueKey: ScoreTrendKey;
  points: TrendPoint[];
  domain: ChartDomain;
  ticks: number[];
  window: DateRangeWindow;
  dateTicks: string[];
  treatment: string;
  seriesLabel: string;
  seriesColor: string;
  loading: boolean;
}

export function ScoreTrendPanel({
  id,
  label,
  valueKey,
  points,
  domain,
  ticks,
  window,
  dateTicks,
  treatment,
  seriesLabel,
  seriesColor,
  loading,
}: ScoreTrendPanelProps) {
  const hasValues = points.some((point) => point[valueKey] !== null);

  return (
    <ChartDateSelection
      points={points}
      window={window}
      loading={loading}
      hasValues={hasValues}
      ariaLabel={`${label} score by date`}
      ariaValueText={(point) => point
        ? point[valueKey] === null
          ? `${point.label}, no ${label} score`
          : `${point.label}, ${label} ${formatScore(point[valueKey])}`
        : `No ${label.toLowerCase()} score`}
    >
      {({ activePoint, activePosition, surfaceProps }) => {
        const activeValue = activePoint?.[valueKey] ?? null;
        const activeY = activeValue === null
          ? null
          : (chartY(activeValue, domain) / CHART_HEIGHT) * 100;

        return (
          <section
            className="score-trend-panel"
            data-tone={valueKey}
            style={{ "--series-color": seriesColor } as SeriesStyle}
            aria-labelledby={`${id}-title`}
          >
            <header className="score-trend-panel-heading">
              <div>
                <h3 id={`${id}-title`}>{label}</h3>
                <p>{treatment}</p>
              </div>
              <output className="score-trend-readout" aria-hidden="true">
                <span>{activePoint?.label ?? "No date"}</span>
                <strong>{loading ? "…" : formatScore(activeValue)}</strong>
              </output>
            </header>
            <div
              className="score-chart-legend"
              role="group"
              aria-label={`${label} chart legend`}
            >
              <span className="score-chart-legend-item">
                <i
                  className="chart-legend-line"
                  style={{ "--series-color": seriesColor } as SeriesStyle}
                  aria-hidden="true"
                />
                <span>
                  <strong>{seriesLabel}</strong>
                  <small>{treatment}</small>
                </span>
              </span>
            </div>
            <div className="score-trend-frame" aria-busy={loading}>
              <div className="score-trend-y-axis" aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    style={{ top: `${(chartY(tick, domain) / CHART_HEIGHT) * 100}%` }}
                    key={tick}
                  >
                    {tick}
                  </span>
                ))}
              </div>
              <div
                className="score-trend-surface"
                {...surfaceProps}
              >
                <svg
                  className="score-trend-chart"
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {ticks.map((tick) => (
                    <line
                      className="score-trend-guide"
                      x1="0"
                      x2={CHART_WIDTH}
                      y1={chartY(tick, domain)}
                      y2={chartY(tick, domain)}
                      key={tick}
                    />
                  ))}
                  <path
                    className="score-trend-series"
                    d={linePath(points, valueKey, domain, window)}
                  />
                </svg>
                {activePoint && hasValues ? (
                  <span
                    className="score-trend-crosshair"
                    style={{ left: `${activePosition * 100}%` }}
                    aria-hidden="true"
                  >
                    {activeY !== null ? (
                      <i className="score-trend-marker" style={{ top: `${activeY}%` }} />
                    ) : null}
                  </span>
                ) : null}
                {loading ? <p className="score-trend-message" role="status">Loading {label.toLowerCase()}…</p> : null}
                {!loading && !hasValues ? <p className="score-trend-message">No {label.toLowerCase()} scores for this range.</p> : null}
              </div>
              <div className="score-trend-date-axis" aria-hidden="true">
                {dateTicks.map((date) => <span key={date}>{date}</span>)}
              </div>
            </div>
            {points.length ? (
              <table className="visually-hidden">
                <caption>{label} score trend data</caption>
                <thead><tr><th>Date</th><th>Score</th></tr></thead>
                <tbody>{points.map((point) => <tr key={point.date}><th>{point.label}</th><td>{formatScore(point[valueKey])}</td></tr>)}</tbody>
              </table>
            ) : null}
          </section>
        );
      }}
    </ChartDateSelection>
  );
}
