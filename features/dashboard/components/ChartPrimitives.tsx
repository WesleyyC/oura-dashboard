import type { ComponentProps, ReactNode } from "react";
import type { ChartDomain } from "../presentation/health-ui";
import { createChartScale } from "../presentation/chart-geometry";

/** Axis labels share the same coordinate transform as the plotted data. */
export function ChartYAxis({
  className,
  ticks,
  domain,
  formatValue = (value) => value,
}: {
  className: string;
  ticks: number[];
  domain: ChartDomain;
  formatValue?(value: number): ReactNode;
}) {
  const position = createChartScale(domain, 100);
  return (
    <div className={className} aria-hidden="true">
      {ticks.map((tick) => (
        <span style={{ top: `${position(tick)}%` }} key={tick}>
          {formatValue(tick)}
        </span>
      ))}
    </div>
  );
}

export function ChartDateAxis({ className, labels }: { className: string; labels: string[] }) {
  return (
    <div className={className} aria-hidden="true">
      {labels.map((label) => <span key={label}>{label}</span>)}
    </div>
  );
}

/** Position is a fraction of the selected date window, not a point index. */
export function ChartCrosshair({
  position,
  className = "chart-selection-crosshair",
  children,
}: {
  position: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={className} style={{ left: `${position * 100}%` }} aria-hidden="true">
      {children}
    </span>
  );
}

/** Marker position is a percentage; callers retain their series identity. */
export function ChartMarker({
  position,
  style,
  className = "chart-selection-marker",
  ...props
}: Omit<ComponentProps<"i">, "children"> & { position: number }) {
  return <i {...props} className={className} style={{ ...style, top: `${position}%` }} />;
}

export function ChartMessage({
  children,
  loading = false,
  className = "chart-message",
}: {
  children: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return <p className={className} role={loading ? "status" : undefined}>{children}</p>;
}
