"use client";

import type { DailyHealthRecord } from "@/features/health-data/client";
import { formatDate, formatMetricValue, formatMinutes, formatScore } from "../presentation/health-ui";

const HEADINGS = ["Date", "Readiness", "Sleep", "Activity", "Total sleep", "Efficiency", "Deep", "REM", "HRV", "Lowest HR", "Breathing", "Stress", "Restorative", "Active", "Sedentary", "Steps", "Active kcal", "Workouts", "Workout time"];

export default function DailyDetailsTable({ records }: { records: DailyHealthRecord[] }) {
  return (
        <div className="table-scroll">
          <table>
            <caption>Daily Oura scores, sleep, body signals, stress, and movement</caption>
            <thead><tr>{HEADINGS.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
            <tbody>{records.toReversed().map((record) => (
              <tr key={record.date}>
                <th scope="row">{formatDate(record.date)}</th>
                <td>{formatScore(record.readinessScore)}</td>
                <td>{formatScore(record.sleepScore)}</td>
                <td>{formatScore(record.activityScore)}</td>
                <td>{formatMinutes(record.totalSleepMinutes)}</td>
                <td>{formatMetricValue(record.sleepEfficiency, "percent")}</td>
                <td>{formatMinutes(record.deepSleepMinutes)}</td>
                <td>{formatMinutes(record.remSleepMinutes)}</td>
                <td>{formatMetricValue(record.hrvMs, "milliseconds")}</td>
                <td>{formatMetricValue(record.restingHeartRate, "bpm")}</td>
                <td>{formatMetricValue(record.averageBreathingRate, "breathing")}</td>
                <td>{formatMinutes(record.stressMinutes)}</td>
                <td>{formatMinutes(record.recoveryMinutes)}</td>
                <td>{formatMinutes(record.activeMinutes)}</td>
                <td>{formatMinutes(record.sedentaryMinutes)}</td>
                <td>{formatMetricValue(record.steps, "integer")}</td>
                <td>{formatMetricValue(record.activeCalories, "calories")}</td>
                <td>{formatMetricValue(record.workoutCount, "count")}</td>
                <td>{formatMinutes(record.workoutMinutes)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
  );
}
