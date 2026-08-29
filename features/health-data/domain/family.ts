import type { DailyHealthRecord } from "./contracts.ts";

export type FamilyScoreKey = "readinessScore" | "sleepScore" | "activityScore";

export interface FamilyProfileRecords {
  profileId: string;
  records: DailyHealthRecord[];
}

export interface FamilyTrendPoint {
  date: string;
  label: string;
  values: Record<string, number | null>;
}

export interface FamilyScoreSummary {
  averages: Record<string, number | null>;
  difference: number | null;
  pairedDays: number;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: Array<number | null | undefined>): number | null {
  const available = values.filter(finite);
  return available.length
    ? available.reduce((total, value) => total + value, 0) / available.length
    : null;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function buildFamilyTrend(
  profiles: FamilyProfileRecords[],
  key: FamilyScoreKey,
  windowDays = 1,
): FamilyTrendPoint[] {
  const recordsByProfile = new Map(
    profiles.map(({ profileId, records }) => [
      profileId,
      new Map(records.map((record) => [record.date, record])),
    ]),
  );
  const dates = [
    ...new Set(
      profiles.flatMap(({ records }) => records.map(({ date }) => date)),
    ),
  ].sort();
  const window = Math.max(1, Math.floor(windowDays));

  return dates.map((date, index) => {
    const trailingDates = dates.slice(
      Math.max(0, index - window + 1),
      index + 1,
    );
    return {
      date,
      label: formatDate(date),
      values: Object.fromEntries(
        profiles.map(({ profileId }) => [
          profileId,
          average(
            trailingDates.map(
              (candidate) => recordsByProfile.get(profileId)?.get(candidate)?.[key],
            ),
          ),
        ]),
      ),
    };
  });
}

export function summarizeFamilyScore(
  profiles: FamilyProfileRecords[],
  key: FamilyScoreKey,
): FamilyScoreSummary {
  const valuesByProfile = new Map(
    profiles.map(({ profileId, records }) => [
      profileId,
      new Map(records.map((record) => [record.date, record[key]])),
    ]),
  );
  const allDates = [
    ...new Set(
      profiles.flatMap(({ records }) => records.map(({ date }) => date)),
    ),
  ];
  const pairedDays = profiles.length
    ? allDates.filter((date) =>
        profiles.every(({ profileId }) =>
          finite(valuesByProfile.get(profileId)?.get(date))
        )
      ).length
    : 0;
  const averages = Object.fromEntries(
    profiles.map(({ profileId }) => [
      profileId,
      average([...(valuesByProfile.get(profileId)?.values() ?? [])]),
    ]),
  );
  const first = profiles[0] ? averages[profiles[0].profileId] : null;
  const second = profiles[1] ? averages[profiles[1].profileId] : null;

  return {
    averages,
    difference:
      profiles.length === 2 && finite(first) && finite(second)
        ? second - first
        : null,
    pairedDays,
  };
}
