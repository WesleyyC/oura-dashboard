import { sql } from "drizzle-orm";

export interface RefreshLease {
  ownerId: string;
  profileId: string;
  id: string;
  expiresAt: string;
}

export class LostRefreshLeaseError extends Error {
  constructor() {
    super("Refresh lease is no longer current");
    this.name = "LostRefreshLeaseError";
  }
}

export function validateLeaseIdentity(lease: RefreshLease, ownerId: string, profileId: string): void {
  if (!lease?.id || lease.ownerId !== ownerId || lease.profileId !== profileId) {
    throw new LostRefreshLeaseError();
  }
}

// Evaluate expiry in SQLite when the write executes, not before a queued
// network round trip. Each guarded mutation must include this predicate.
export function currentRefreshLease(lease: RefreshLease) {
  return sql`EXISTS (
    SELECT 1 FROM health_sync_state_profile
    WHERE owner_id = ${lease.ownerId} AND profile_id = ${lease.profileId}
      AND lease_id = ${lease.id} AND status = 'refreshing'
      AND lock_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )`;
}
