"use client";

import type { CSSProperties } from "react";

import {
  buildMetricTrendPoints,
  rangeDateTicks,
  rangeWindow,
  trendWindowDays,
  type DailyHealthRecord,
  type MetricDefinition,
  type RangeKey,
} from "@/features/health-data/client";
import {
  formatDate,
  formatMetricValue,
  metricDomain,
} from "../presentation/health-ui";
import {
  ChartDateReadout,
  ChartDateSelection,
} from "./ChartDateSelection";
import { CHART_WIDTH, chartLinePath, createChartScale } from "../presentation/chart-geometry";
import { ChartCrosshair, ChartDateAxis, ChartMarker, ChartMessage, ChartYAxis } from "./ChartPrimitives";

const CHART_HEIGHT = 240;

export interface MetricChartSeries {
  id: string;
  label: string;
  records: DailyHealthRecord[];
  average: number | null;
  loading?: boolean;
  identity: { type: "metric"; tone: MetricDefinition["tone"] }
    | { type: "person"; profileId: string; color: string };
}

export interface MetricTrendChartProps {
  id: string;
  metric: MetricDefinition;
  range: RangeKey;
  today: string;
  series: MetricChartSeries[];
  loading: boolean;
}

type SeriesStyle = CSSProperties & { "--series-color"?: string };

function seriesStyle(
  identity: MetricChartSeries["identity"],
): SeriesStyle | undefined {
  return identity.type === "person"
    ? { "--series-color": identity.color }
    : undefined;
}

export function MetricTrendChart({
  id,
  metric,
  range,
  today,
  series,
  loading,
}: MetricTrendChartProps) {
  const windowDays = trendWindowDays(range);
  const plotted = series.map((item) => ({
    ...item,
    points: buildMetricTrendPoints(item.records, metric.key, windowDays),
  }));
  const dates = [...new Set(plotted.flatMap((item) => item.points.map((point) => point.date)))].sort();
  const selectionPoints = dates.map((date) => ({ date }));
  const valuesBySeries = new Map(
    plotted.map((item) => [
      item.id,
      new Map(item.points.map((point) => [point.date, point.value])),
    ]),
  );
  const values = plotted.flatMap((item) => item.points.map((point) => point.value));
  const domain = metricDomain(values, series.map((item) => item.average));
  const { minimum, maximum } = domain;
  const chartY = createChartScale(domain, CHART_HEIGHT);
  const hasValues = values.some((value) => value !== null && Number.isFinite(value));
  const hasSelectableValues = plotted.some(
    (item) => !item.loading && item.points.some(
      (point) => point.value !== null && Number.isFinite(point.value),
    ),
  );
  const selectionPending = loading && !hasSelectableValues;
  const titleId = `${id}-chart-title`;
  const descriptionId = `${id}-chart-description`;
  const treatment = windowDays === 7 ? "7-day moving average" : "Daily values";
  const window = rangeWindow(range, today);
  const dateTicks = rangeDateTicks(range, today).map(formatDate);

  // Keep data-derived markup outside the selection render callback. Moving a
  // crosshair should not rebuild every path and accessible table row.
  const chart = (
    <svg
      className="metric-line-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>{`${metric.label} trend`}</title>
      <desc id={descriptionId}>{`${treatment}. Solid lines show the trend; horizontal references show range averages.`}</desc>
      {[0, 0.5, 1].map((ratio) => (
        <line className="metric-chart-guide" x1="0" x2={CHART_WIDTH} y1={ratio * CHART_HEIGHT} y2={ratio * CHART_HEIGHT} key={ratio} />
      ))}
      {plotted.map((item) => {
        const identity = item.identity;
        const valueByDate = valuesBySeries.get(item.id) ?? new Map();
        return (
          <g key={item.id}>
            {item.average !== null ? (
              <line
                className="metric-average-line"
                data-tone={identity.type === "metric" ? identity.tone : undefined}
                data-identity={identity.type}
                data-profile-id={identity.type === "person" ? identity.profileId : undefined}
                style={seriesStyle(identity)}
                x1="0"
                x2={CHART_WIDTH}
                y1={chartY(item.average)}
                y2={chartY(item.average)}
              />
            ) : null}
            <path
              className="metric-chart-series"
              data-tone={identity.type === "metric" ? identity.tone : undefined}
              data-identity={identity.type}
              data-profile-id={identity.type === "person" ? identity.profileId : undefined}
              style={seriesStyle(identity)}
              d={chartLinePath(selectionPoints, (point) => valueByDate.get(point.date), chartY, window)}
            />
          </g>
        );
      })}
    </svg>
  );
  const dataTable = (
    <table className="visually-hidden">
      <caption>{`${metric.label} ${treatment.toLowerCase()} and range averages`}</caption>
      <thead><tr><th>Date</th>{series.map((item) => <th key={item.id}>{item.label}</th>)}</tr></thead>
      <tbody>{dates.map((date) => (
        <tr key={date}>
          <th>{formatDate(date)}</th>
          {plotted.map((item) => (
            <td key={item.id}>{formatMetricValue(valuesBySeries.get(item.id)?.get(date) ?? null, metric.format)}</td>
          ))}
        </tr>
      ))}</tbody>
      <tfoot><tr><th>Range average</th>{series.map((item) => <td key={item.id}>{formatMetricValue(item.average, metric.format)}</td>)}</tr></tfoot>
    </table>
  );

  return (
    <ChartDateSelection
      points={selectionPoints}
      window={window}
      loading={selectionPending}
      hasValues={hasSelectableValues}
      ariaLabel={`${metric.label} by date`}
      ariaValueText={(point) => point
        ? [
            formatDate(point.date),
            ...plotted.map((item) => (
              item.loading
                ? `${item.label} loading`
                : `${item.label} ${formatMetricValue(
                    valuesBySeries.get(item.id)?.get(point.date) ?? null,
                    metric.format,
                  )}`
            )),
          ].join(", ")
        : `No ${metric.label.toLowerCase()} measurements`}
    >
      {({ activePoint, activePosition, surfaceProps }) => {
        const activeDate = activePoint?.date ?? null;
        const activeValues = plotted.map((item) => ({
          item,
          value: activeDate
            ? valuesBySeries.get(item.id)?.get(activeDate) ?? null
            : null,
        }));

        return (
          <section className="metric-explorer" id={id} aria-labelledby={`${id}-title`}>
            <header className="metric-explorer-heading">
              <div>
                <h3 id={`${id}-title`}>{metric.label} trend</h3>
                <p>{treatment} · range average shown</p>
              </div>
              <div
                className="metric-chart-legend"
                role="group"
                aria-label={`${metric.label} chart legend`}
              >
                {series.map((item) => (
                  <span
                    className="metric-chart-legend-item"
                    data-tone={item.identity.type === "metric" ? item.identity.tone : undefined}
                    data-identity={item.identity.type}
                    data-profile-id={item.identity.type === "person" ? item.identity.profileId : undefined}
                    style={seriesStyle(item.identity)}
                    key={item.id}
                  >
                    <i className="chart-legend-line" aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>Range average · {formatMetricValue(item.average, metric.format)}</small></span>
                  </span>
                ))}
              </div>
            </header>

            <div className="metric-chart-frame" aria-busy={selectionPending}>
              <ChartDateReadout
                className="metric-date-readout"
                date={activeDate ? formatDate(activeDate) : "No date"}
                values={activeValues.map(({ item, value }) => ({
                  id: item.id,
                  label: item.label,
                  value: item.loading ? "…" : formatMetricValue(value, metric.format),
                  color: item.identity.type === "person"
                    ? item.identity.color
                    : undefined,
                }))}
              />
              <div className="metric-chart-body">
                <ChartYAxis
                  className="metric-chart-y-axis"
                  ticks={[maximum, minimum]}
                  domain={domain}
                  formatValue={(value) => formatMetricValue(value, metric.format)}
                />
                <div
                  className="metric-chart-plot chart-selection-surface"
                  {...surfaceProps}
                >
                  {chart}
                  {activePoint && hasSelectableValues ? (
                    <ChartCrosshair position={activePosition}>
                      {activeValues.map(({ item, value }) => {
                        if (
                          item.loading ||
                          value === null ||
                          !Number.isFinite(value)
                        ) return null;
                        return (
                          <ChartMarker
                            position={(chartY(value) / CHART_HEIGHT) * 100}
                            data-tone={item.identity.type === "metric" ? item.identity.tone : undefined}
                            data-profile-id={item.identity.type === "person" ? item.identity.profileId : undefined}
                            style={seriesStyle(item.identity)}
                            key={item.id}
                          />
                        );
                      })}
                    </ChartCrosshair>
                  ) : null}
                  {selectionPending ? <ChartMessage loading>Loading this trend…</ChartMessage> : null}
                  {!loading && !hasValues ? <ChartMessage>No measurements are available for this range.</ChartMessage> : null}
                </div>
              </div>
              <ChartDateAxis className="chart-date-axis metric-date-axis" labels={dateTicks} />
            </div>

            {dataTable}
          </section>
        );
      }}
    </ChartDateSelection>
  );
}
