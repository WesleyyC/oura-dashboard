const API_BASE_URL = "https://api.ouraring.com/v2/usercollection";
const MAX_PAGES = 100;
const MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 60_000;

export const OURA_RESOURCES = {
  daily_activity: {
    path: "daily_activity",
    fields:
      "day,score,steps,active_calories,total_calories,equivalent_walking_distance,high_activity_time,medium_activity_time,low_activity_time,sedentary_time",
    exclusiveEnd: true,
  },
  daily_readiness: {
    path: "daily_readiness",
    fields: "day,score,temperature_deviation",
    exclusiveEnd: false,
  },
  daily_sleep: {
    path: "daily_sleep",
    fields: "day,score",
    exclusiveEnd: false,
  },
  sleep: {
    path: "sleep",
    fields:
      "day,type,total_sleep_duration,time_in_bed,deep_sleep_duration,rem_sleep_duration,efficiency,latency,average_breath,average_heart_rate,average_hrv,lowest_heart_rate",
    exclusiveEnd: true,
  },
  daily_stress: {
    path: "daily_stress",
    fields: "day,stress_high,recovery_high",
    exclusiveEnd: false,
  },
  workout: {
    path: "workout",
    fields: "day,start_datetime,end_datetime,calories,distance",
    exclusiveEnd: true,
  },
} as const;

export type OuraResource = keyof typeof OURA_RESOURCES;
export type OuraApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "pagination";

const ERROR_MESSAGES: Record<OuraApiErrorCode, string> = {
  invalid_request: "Oura resource request is invalid",
  unauthorized: "Oura authorization is no longer valid",
  rate_limited: "Oura rate limit was reached",
  unavailable: "Oura is temporarily unavailable",
  invalid_response: "Oura returned an invalid response",
  pagination: "Oura pagination could not be completed safely",
};

export class OuraApiError extends Error {
  readonly code: OuraApiErrorCode;

  constructor(code: OuraApiErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "OuraApiError";
    this.code = code;
  }
}

export interface OuraDateRange {
  start: string;
  end: string;
}

export interface OuraClientOptions {
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

export async function fetchOuraResource(
  resource: string,
  range: OuraDateRange,
  accessToken: string,
  options: OuraClientOptions = {},
): Promise<Record<string, unknown>[]> {
  if (!Object.hasOwn(OURA_RESOURCES, resource)) {
    throw new OuraApiError("invalid_request");
  }
  const spec = OURA_RESOURCES[resource as OuraResource];
  validateRange(range);
  if (!accessToken || accessToken.length > 8_192) {
    throw new OuraApiError("invalid_request");
  }

  const baseUrl = new URL(`${API_BASE_URL}/${spec.path}`);
  baseUrl.searchParams.set("start_date", range.start);
  baseUrl.searchParams.set(
    "end_date",
    spec.exclusiveEnd ? addUtcDays(range.end, 1) : range.end,
  );
  baseUrl.searchParams.set("fields", spec.fields);

  const rows: Record<string, unknown>[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pageUrl = new URL(baseUrl);
    if (nextToken) pageUrl.searchParams.set("next_token", nextToken);
    const response = await requestWithRetries(
      pageUrl,
      accessToken,
      options,
    );
    const payload = await parsePayload(response);
    const data = payload.data;
    if (
      !Array.isArray(data) ||
      data.some(
        (row) => !row || typeof row !== "object" || Array.isArray(row),
      )
    ) {
      throw new OuraApiError("invalid_response");
    }
    rows.push(...data as Record<string, unknown>[]);

    const rawNextToken = payload.next_token;
    if (
      rawNextToken !== undefined &&
      rawNextToken !== null &&
      typeof rawNextToken !== "string"
    ) {
      throw new OuraApiError("invalid_response");
    }
    nextToken = rawNextToken || null;
    if (!nextToken) break;
    if (seenTokens.has(nextToken) || page === MAX_PAGES) {
      throw new OuraApiError("pagination");
    }
    seenTokens.add(nextToken);
  }

  return rows.filter((row) => {
    if (typeof row.day !== "string") return true;
    return row.day >= range.start && row.day <= range.end;
  });
}

async function requestWithRetries(
  url: URL,
  accessToken: string,
  options: OuraClientOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;
  const now = options.now ?? (() => new Date());

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new OuraApiError("unavailable");
    }
    if (
      attempt < MAX_RETRIES &&
      (response.status === 429 || response.status >= 500)
    ) {
      const delay =
        response.status === 429
          ? retryAfterMilliseconds(response.headers.get("Retry-After"), now())
          : Math.min(8_000, 1_000 * 2 ** attempt);
      await sleep(delay);
      continue;
    }
    if (response.status === 401) throw new OuraApiError("unauthorized");
    if (response.status === 429) throw new OuraApiError("rate_limited");
    if (response.status >= 500) throw new OuraApiError("unavailable");
    if (!response.ok) throw new OuraApiError("invalid_response");
    return response;
  }

  throw new OuraApiError("unavailable");
}

async function parsePayload(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid payload");
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new OuraApiError("invalid_response");
  }
}

function retryAfterMilliseconds(value: string | null, now: Date): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(
      MAX_RETRY_DELAY_MS,
      Math.max(0, Math.round(seconds * 1_000)),
    );
  }
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.min(
      MAX_RETRY_DELAY_MS,
      Math.max(0, date - now.getTime()),
    );
  }
  return 1_000;
}

function validateRange(range: OuraDateRange): void {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  if (start > end) throw new OuraApiError("invalid_request");
}

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new OuraApiError("invalid_request");
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new OuraApiError("invalid_request");
  }
  return timestamp;
}

function addUtcDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
