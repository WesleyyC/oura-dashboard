import type { DailyHealthRecord } from "@/features/health-data/client";

import { mergeOuraAggregates } from "../domain/aggregate";
import {
  fetchOuraResource,
  type OuraClientOptions,
  type OuraDateRange,
} from "./oura-client";

export async function collectOuraAggregates(
  profileSlug: string,
  range: OuraDateRange,
  accessToken: string,
  options: OuraClientOptions = {},
): Promise<DailyHealthRecord[]> {
  if (
    !/^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/.test(profileSlug)
  ) {
    throw new Error("Oura profile slug is invalid");
  }
  const pending = new AbortController();
  const sharedOptions = { ...options, signal: AbortSignal.any([pending.signal, ...(options.signal ? [options.signal] : [])]) };
  try {
    const [activity, readiness, dailySleep, sleep, stress, workouts] =
    await Promise.all([
      fetchOuraResource("daily_activity", range, accessToken, sharedOptions),
      fetchOuraResource("daily_readiness", range, accessToken, sharedOptions),
      fetchOuraResource("daily_sleep", range, accessToken, sharedOptions),
      fetchOuraResource("sleep", range, accessToken, sharedOptions),
      fetchOuraResource("daily_stress", range, accessToken, sharedOptions),
      fetchOuraResource("workout", range, accessToken, sharedOptions),
    ]);

  return mergeOuraAggregates({
    ...range,
    activity,
    readiness,
    dailySleep,
    sleep,
    stress,
    workouts,
  });
  } finally {
    pending.abort();
  }
}
