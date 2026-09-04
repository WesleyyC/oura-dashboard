"use client";

import type { CSSProperties } from "react";

import type { DateRangeWindow } from "@/features/health-data/client";
import {
  formatScore,
  type ChartDomain,
  type TrendPoint,
} from "../presentation/health-ui";
import { ChartDateSelection } from "./ChartDateSelection";
import { CHART_WIDTH, chartLinePath, createChartScale } from "../presentation/chart-geometry";
import { ChartCrosshair, ChartDateAxis, ChartMarker, ChartMessage, ChartYAxis } from "./ChartPrimitives";

type ScoreTrendKey = "readiness" | "sleep" | "activity";

const CHART_HEIGHT = 180;

type SeriesStyle = CSSProperties & { "--series-color"?: string };

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
  const chartY = createChartScale(domain, CHART_HEIGHT);

  // Keep data-derived markup outside the selection render callback. Moving a
  // crosshair should not rebuild every path and accessible table row.
  const chart = (
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
          y1={chartY(tick)}
          y2={chartY(tick)}
          key={tick}
        />
      ))}
      <path
        className="score-trend-series"
        d={chartLinePath(points, (point) => point[valueKey], chartY, window)}
      />
    </svg>
  );
  const dataTable = (
    <table className="visually-hidden">
      <caption>{label} score trend data</caption>
      <thead><tr><th>Date</th><th>Score</th></tr></thead>
      <tbody>{points.map((point) => <tr key={point.date}><th>{point.label}</th><td>{formatScore(point[valueKey])}</td></tr>)}</tbody>
    </table>
  );

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
          : (chartY(activeValue) / CHART_HEIGHT) * 100;

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
              <ChartYAxis className="score-trend-y-axis" ticks={ticks} domain={domain} />
              <div
                className="score-trend-surface"
                {...surfaceProps}
              >
                {chart}
                {activePoint && hasValues ? (
                  <ChartCrosshair
                    className="score-trend-crosshair"
                    position={activePosition}
                  >
                    {activeY !== null ? (
                      <ChartMarker className="score-trend-marker" position={activeY} />
                    ) : null}
                  </ChartCrosshair>
                ) : null}
                {loading ? <ChartMessage className="score-trend-message" loading>Loading {label.toLowerCase()}…</ChartMessage> : null}
                {!loading && !hasValues ? <ChartMessage className="score-trend-message">No {label.toLowerCase()} scores for this range.</ChartMessage> : null}
              </div>
              <ChartDateAxis className="score-trend-date-axis" labels={dateTicks} />
            </div>
            {points.length ? dataTable : null}
          </section>
        );
      }}
    </ChartDateSelection>
  );
}
