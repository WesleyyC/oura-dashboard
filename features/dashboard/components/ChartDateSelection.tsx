"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  dateRangePosition,
  type DateRangeWindow,
} from "@/features/health-data/client";
import {
  moveScoreTrendIndex,
  nearestScoreTrendIndex,
} from "../presentation/health-ui";

interface ChartDateSelectionContextValue {
  selectedDate: string | null;
  selectDate(date: string): void;
}

const ChartDateSelectionContext =
  createContext<ChartDateSelectionContextValue | null>(null);

export function ChartDateSelectionGroup({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const value = useMemo(
    () => ({ selectedDate, selectDate: setSelectedDate }),
    [selectedDate],
  );

  return (
    <ChartDateSelectionContext.Provider value={value}>
      {children}
    </ChartDateSelectionContext.Provider>
  );
}

export interface ChartDateSelectionPoint {
  date: string;
}

export interface ChartDateSelectionState<
  T extends ChartDateSelectionPoint,
> {
  activeIndex: number;
  activePoint: T | null;
  activePosition: number;
  interactive: boolean;
  surfaceProps: {
    role: "slider";
    tabIndex: number;
    "aria-label": string;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    "aria-valuetext": string;
    "aria-disabled": boolean;
    "data-chart-input": "pointer" | "keyboard" | undefined;
    onBlur(): void;
    onPointerMove(event: PointerEvent<HTMLDivElement>): void;
    onPointerDown(event: PointerEvent<HTMLDivElement>): void;
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  };
}

interface ChartDateSelectionProps<T extends ChartDateSelectionPoint> {
  points: T[];
  window: DateRangeWindow;
  loading: boolean;
  hasValues: boolean;
  ariaLabel: string;
  ariaValueText(point: T | null): string;
  children(state: ChartDateSelectionState<T>): ReactNode;
}

export function ChartDateSelection<T extends ChartDateSelectionPoint>({
  points,
  window,
  loading,
  hasValues,
  ariaLabel,
  ariaValueText,
  children,
}: ChartDateSelectionProps<T>) {
  const group = useContext(ChartDateSelectionContext);
  const [localSelectedDate, setLocalSelectedDate] = useState<string | null>(null);
  const [inputMethod, setInputMethod] = useState<"pointer" | "keyboard">();
  const selectedDate = group ? group.selectedDate : localSelectedDate;
  const selectDate = group ? group.selectDate : setLocalSelectedDate;
  const positions = useMemo(
    () => points.map((point) => dateRangePosition(point.date, window)),
    [points, window],
  );
  const selectedIndex = selectedDate
    ? points.findIndex((point) => point.date === selectedDate)
    : -1;
  const activeIndex = selectedIndex >= 0
    ? selectedIndex
    : Math.max(0, points.length - 1);
  const activePoint = points[activeIndex] ?? null;
  const activePosition = positions[activeIndex] ?? 0;
  const interactive = !loading && hasValues && points.length > 0;

  function selectFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const index = nearestScoreTrendIndex(
      positions,
      (event.clientX - bounds.left) / bounds.width,
    );
    if (index !== null) selectDate(points[index].date);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return;
    const index = moveScoreTrendIndex(activeIndex, event.key, points.length);
    if (index === null) return;
    event.preventDefault();
    setInputMethod("keyboard");
    selectDate(points[index].date);
  }

  return children({
    activeIndex,
    activePoint,
    activePosition,
    interactive,
    surfaceProps: {
      role: "slider",
      tabIndex: interactive ? 0 : -1,
      "aria-label": ariaLabel,
      "aria-valuemin": 0,
      "aria-valuemax": Math.max(0, points.length - 1),
      "aria-valuenow": activeIndex,
      "aria-valuetext": ariaValueText(activePoint),
      "aria-disabled": !interactive,
      "data-chart-input": inputMethod,
      onBlur: () => setInputMethod(undefined),
      onPointerMove: selectFromPointer,
      onPointerDown: (event) => {
        if (!interactive) return;
        setInputMethod("pointer");
        selectFromPointer(event);
        event.currentTarget.focus({ preventScroll: true });
      },
      onKeyDown: handleKeyDown,
    },
  });
}

export interface ChartDateReadoutValue {
  id: string;
  label: string;
  value: string;
  color?: string;
}

type ReadoutStyle = CSSProperties & { "--series-color"?: string };

export function ChartDateReadout({
  date,
  values,
  className,
}: {
  date: string;
  values: ChartDateReadoutValue[];
  className?: string;
}) {
  return (
    <output
      className={["chart-date-readout", className].filter(Boolean).join(" ")}
      data-chart-date-readout="true"
      aria-hidden="true"
    >
      <span className="chart-date-readout-date">{date}</span>
      <span className="chart-date-readout-values">
        {values.map((item) => (
          <span
            className="chart-date-readout-item"
            data-series-id={item.id}
            style={item.color
              ? { "--series-color": item.color } as ReadoutStyle
              : undefined}
            key={item.id}
          >
            <i className="chart-date-readout-mark" aria-hidden="true" />
            <span className="chart-date-readout-label">{item.label}</span>
            <strong>{item.value}</strong>
          </span>
        ))}
      </span>
    </output>
  );
}
