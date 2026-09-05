import {
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const LEGACY_UNCLAIMED_OWNER_ID = "__legacy_unclaimed__";

function dailyHealthColumns() {
  return {
    sleepScore: integer("sleep_score"),
    readinessScore: integer("readiness_score"),
    activityScore: integer("activity_score"),
    totalSleepMinutes: real("total_sleep_minutes"),
    timeInBedMinutes: real("time_in_bed_minutes"),
    sleepEfficiency: real("sleep_efficiency"),
    deepSleepMinutes: real("deep_sleep_minutes"),
    remSleepMinutes: real("rem_sleep_minutes"),
    sleepLatencyMinutes: real("sleep_latency_minutes"),
    averageBreathingRate: real("average_breathing_rate"),
    averageHeartRate: real("average_heart_rate"),
    hrvMs: real("hrv_ms"),
    restingHeartRate: real("resting_heart_rate"),
    temperatureDeviationC: real("temperature_deviation_c"),
    stressMinutes: real("stress_minutes"),
    recoveryMinutes: real("recovery_minutes"),
    steps: integer("steps"),
    activeCalories: integer("active_calories"),
    totalCalories: integer("total_calories"),
    activeMinutes: real("active_minutes"),
    sedentaryMinutes: real("sedentary_minutes"),
    walkingEquivalentMeters: real("walking_equivalent_meters"),
    workoutMinutes: real("workout_minutes"),
    workoutCount: integer("workout_count"),
    workoutCalories: real("workout_calories"),
    workoutDistanceMeters: real("workout_distance_meters"),
  };
}

function legacyCalendarColumns() {
  return {
    meetingMinutes: real("meeting_minutes"),
    meetingCount: integer("meeting_count"),
    personalMinutes: real("personal_minutes"),
    workMinutes: real("work_minutes"),
    focusMinutes: real("focus_minutes"),
    lateMeetingMinutes: real("late_meeting_minutes"),
  };
}

export const healthDaily = sqliteTable(
  "health_daily",
  {
    date: text("date").primaryKey(),
    ...dailyHealthColumns(),
    // Legacy calendar columns are intentionally retained to avoid a destructive table rebuild.
    ...legacyCalendarColumns(),
    ingestedAt: text("ingested_at").notNull(),
  },
  (table) => [index("health_daily_ingested_at_idx").on(table.ingestedAt)],
);

export const healthSyncState = sqliteTable("health_sync_state", {
  id: integer("id").primaryKey(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  rowCount: integer("row_count").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const healthAccounts = sqliteTable("health_accounts", {
  ownerId: text("owner_id").primaryKey(),
  createdAt: text("created_at").notNull(),
  legacyClaimedAt: text("legacy_claimed_at"),
});

export const healthProfiles = sqliteTable(
  "health_profiles",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => healthAccounts.ownerId, {
        onUpdate: "cascade",
        onDelete: "cascade",
      }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    colorKey: text("color_key"),
    sortOrder: integer("sort_order").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("health_profiles_owner_slug_uidx").on(table.ownerId, table.slug),
    uniqueIndex("health_profiles_owner_id_uidx").on(table.ownerId, table.id),
    index("health_profiles_owner_sort_idx").on(table.ownerId, table.sortOrder),
  ],
);

export const ouraCredentials = sqliteTable(
  "oura_credentials",
  {
    ownerId: text("owner_id").notNull(),
    profileId: text("profile_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    encryptionVersion: integer("encryption_version").notNull(),
    expiresAt: text("expires_at").notNull(),
    grantedScopes: text("granted_scopes").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.profileId] }),
    foreignKey({
      columns: [table.ownerId, table.profileId],
      foreignColumns: [healthProfiles.ownerId, healthProfiles.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const ouraOAuthStates = sqliteTable(
  "oura_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    ownerId: text("owner_id").notNull(),
    profileId: text("profile_id").notNull(),
    flow: text("flow").$type<"owner" | "guest">().notNull().default("owner"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId, table.profileId],
      foreignColumns: [healthProfiles.ownerId, healthProfiles.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("oura_oauth_states_expires_idx").on(table.expiresAt),
  ],
);

export const ouraConnectionInvites = sqliteTable(
  "oura_connection_invites",
  {
    inviteHash: text("invite_hash").primaryKey(),
    ownerId: text("owner_id").notNull(),
    profileId: text("profile_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId, table.profileId],
      foreignColumns: [healthProfiles.ownerId, healthProfiles.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    uniqueIndex("oura_connection_invites_profile_uidx").on(
      table.ownerId,
      table.profileId,
    ),
    index("oura_connection_invites_expires_idx").on(table.expiresAt),
  ],
);

export const securityRateLimits = sqliteTable(
  "security_rate_limits",
  {
    scope: text("scope").notNull(),
    actorDigest: text("actor_digest").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    requestCount: integer("request_count").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.actorDigest] }),
    index("security_rate_limits_expires_idx").on(table.expiresAt),
  ],
);

export const healthDailyProfile = sqliteTable(
  "health_daily_profile",
  {
    ownerId: text("owner_id").notNull(),
    profileId: text("profile_id").notNull(),
    date: text("date").notNull(),
    ...dailyHealthColumns(),
    ingestedAt: text("ingested_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.profileId, table.date] }),
    foreignKey({
      columns: [table.ownerId, table.profileId],
      foreignColumns: [healthProfiles.ownerId, healthProfiles.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("health_daily_profile_ingested_at_idx").on(
      table.ownerId,
      table.profileId,
      table.ingestedAt,
    ),
  ],
);

export const healthSyncStateProfile = sqliteTable(
  "health_sync_state_profile",
  {
    ownerId: text("owner_id").notNull(),
    profileId: text("profile_id").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    rowCount: integer("row_count").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    lastSucceededAt: text("last_succeeded_at"),
    status: text("status").notNull(),
    safeErrorCode: text("safe_error_code"),
    lockExpiresAt: text("lock_expires_at"),
    leaseId: text("lease_id"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.profileId] }),
    foreignKey({
      columns: [table.ownerId, table.profileId],
      foreignColumns: [healthProfiles.ownerId, healthProfiles.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("health_sync_state_status_idx").on(table.ownerId, table.status),
  ],
);
