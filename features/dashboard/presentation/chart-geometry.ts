import { dateRangePosition, type DateRangeWindow } from "@/features/health-data/client";
import type { ChartDomain } from "./health-ui";

export const CHART_WIDTH = 1_000;

export function createChartScale(
  domain: ChartDomain,
  height: number,
  options: { clamp?: boolean } = {},
): (value: number) => number {
  return (value) => {
    const plotted = options.clamp
      ? Math.min(domain.maximum, Math.max(domain.minimum, value))
      : value;
    return ((domain.maximum - plotted) / (domain.maximum - domain.minimum)) * height;
  };
}

export function chartLinePath<T extends { date: string }>(
  points: T[],
  valueFor: (point: T) => number | null | undefined,
  yFor: (value: number) => number,
  window: DateRangeWindow,
): string {
  let continues = false;
  return points.map((point) => {
    const value = valueFor(point);
    if (value === null || value === undefined || !Number.isFinite(value)) {
      continues = false;
      return "";
    }
    const command = continues ? "L" : "M";
    continues = true;
    const x = dateRangePosition(point.date, window) * CHART_WIDTH;
    return `${command}${x.toFixed(1)} ${yFor(value).toFixed(1)}`;
  }).filter(Boolean).join(" ");
}
