import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DashboardContent } from "@/features/dashboard/components/DashboardScreen";
import type { ProfileLoadState } from "@/features/dashboard/model/dashboard-state";
import type { DailyHealthRecord, RangeKey } from "@/features/health-data/client";
import { normalizeProfileSlug } from "@/features/profile-management/client";
import "@/app/globals.css";

// This fixture never mounts the network controller or authenticates a user.
const today = "2026-09-04";
const updatedAt = `${today}T12:00:00Z`;
const scenario = new URLSearchParams(location.search).get("scenario");
const profiles: ProfileLoadState[] = ["Alex", "Blair"].map((name, person) => ({
  profile: {
    id: `fictional-${person}`, slug: normalizeProfileSlug(name), displayName: name,
    colorKey: person ? "berry" : "ocean", sortOrder: person,
    status: "connected", updatedAt, lastSucceededAt: updatedAt,
    coverageStartDate: "2026-03-01", safeErrorCode: null,
  },
  records: scenario === "empty" || scenario === "loading" || (scenario === "partial" && person === 1)
    ? []
    : Array.from({ length: 188 }, (_, index): DailyHealthRecord => {
        const date = new Date("2026-03-01T00:00:00Z");
        date.setUTCDate(date.getUTCDate() + index);
        const wave = Math.sin(index * 0.7 + person) * 8;
        const missing = scenario === "gaps" && date.toISOString().startsWith("2026-09-01");
        return {
          date: date.toISOString().slice(0, 10),
          readinessScore: missing ? null : 82 + wave,
          sleepScore: missing ? null : 80 - wave,
          activityScore: missing ? null : 78 + wave / 2,
          totalSleepMinutes: missing ? null : 445 + wave * 4,
          timeInBedMinutes: null, sleepEfficiency: 87 + wave / 2,
          deepSleepMinutes: 70 + wave, remSleepMinutes: 100 + wave * 2,
          sleepLatencyMinutes: null, averageBreathingRate: 14 + wave / 8,
          averageHeartRate: null, hrvMs: 48 + wave,
          restingHeartRate: 52 - wave / 2, temperatureDeviationC: null,
          stressMinutes: 80 + wave * 2, recoveryMinutes: 55 - wave,
          steps: 7800 + wave * 200, activeCalories: 550 + wave * 15,
          totalCalories: null, activeMinutes: 90 + wave * 4,
          sedentaryMinutes: 450 - wave * 3, walkingEquivalentMeters: null,
          workoutMinutes: 45 + wave, workoutCount: 1,
          workoutCalories: null, workoutDistanceMeters: null,
        };
      }),
  updatedAt, loading: scenario === "loading" || (scenario === "partial" && person === 1),
  refreshing: false, error: null, historyError: null,
  loadedStartDate: "2026-03-01", loadedEndDate: today,
}));

function Fixture() {
  const params = new URLSearchParams(location.search);
  const [view, changeView] = useState(params.get("view") === "family" ? "family" : "alex");
  const [range, setRange] = useState<RangeKey>(params.get("range") === "7d" ? "7d" : "6m");
  return (
    <DashboardContent controller={{
      view, changeView, range, setRange, profiles, profilesLoading: false,
      profileListError: null, now: new Date(updatedAt), today, timeZone: "UTC",
      refreshProfiles: async () => {}, retryProfiles() {},
    }} />
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
