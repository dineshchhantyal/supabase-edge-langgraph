// src/server/usage.ts
// Usage ledger helpers for enforcing subscription quotas.
// @ts-ignore: Supabase client types resolve at runtime.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.ts";

export type UsagePeriod = "daily" | "weekly" | "monthly";

export interface UsageSnapshot {
  period: UsagePeriod;
  periodStart: string;
  tokensUsed: number;
  secondsActive: number;
  runs: number;
  limit: number;
}

export interface QuotaStatus {
  allowed: boolean;
  snapshots: Record<UsagePeriod, UsageSnapshot>;
  blockedPeriod?: UsagePeriod;
}

export interface UsageDelta {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  secondsActive: number;
}

const LIMITS: Record<UsagePeriod, number> = {
  daily: 200_000,
  weekly: 600_000,
  monthly: 1_800_000,
};

interface PeriodCalc {
  period: UsagePeriod;
  start: () => Date;
}

const PERIODS: PeriodCalc[] = [
  { period: "daily", start: () => startOfDay(new Date()) },
  { period: "weekly", start: () => startOfWeek(new Date()) },
  { period: "monthly", start: () => startOfMonth(new Date()) },
];

type UsageLedgerRow = Database["public"]["Tables"]["usage_ledgers"]["Row"];

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfWeek(now: Date): Date {
  const day = now.getUTCDay();
  const diff = (day + 6) % 7; // make Monday week start
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - diff);
  return startOfDay(start);
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchLedger(
  client: SupabaseClient<Database>,
  userId: string,
  period: UsagePeriod,
  periodStart: string
): Promise<UsageLedgerRow | null> {
  const { data, error } = await client
    .from("usage_ledgers")
    .select("user_id, period, period_start, tokens_used, seconds_active, runs")
    .eq("user_id", userId)
    .eq("period", period)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("fetchLedger error", { period, periodStart, error });
  }

  return data ?? null;
}

export async function ensureUsageWithinLimits(
  client: SupabaseClient<Database>,
  userId: string
): Promise<QuotaStatus> {
  const snapshots: Record<UsagePeriod, UsageSnapshot> = {
    daily: {
      period: "daily",
      periodStart: "",
      tokensUsed: 0,
      secondsActive: 0,
      runs: 0,
      limit: LIMITS.daily,
    },
    weekly: {
      period: "weekly",
      periodStart: "",
      tokensUsed: 0,
      secondsActive: 0,
      runs: 0,
      limit: LIMITS.weekly,
    },
    monthly: {
      period: "monthly",
      periodStart: "",
      tokensUsed: 0,
      secondsActive: 0,
      runs: 0,
      limit: LIMITS.monthly,
    },
  };

  let blockedPeriod: UsagePeriod | undefined;

  for (const { period, start } of PERIODS) {
    const periodStart = formatDate(start());
    const row = await fetchLedger(client, userId, period, periodStart);
    const limit = LIMITS[period];
    const tokensUsed = row?.tokens_used ?? 0;
    const secondsActive = row?.seconds_active ?? 0;
    const runs = row?.runs ?? 0;

    snapshots[period] = {
      period,
      periodStart,
      tokensUsed,
      secondsActive,
      runs,
      limit,
    };

    if (tokensUsed >= limit && !blockedPeriod) {
      blockedPeriod = period;
    }
  }

  return {
    allowed: !blockedPeriod,
    snapshots,
    blockedPeriod,
  };
}

export async function applyUsageDelta(
  client: SupabaseClient<Database>,
  userId: string,
  snapshots: Record<UsagePeriod, UsageSnapshot>,
  delta: UsageDelta
): Promise<void> {
  const totalTokens = Math.max(0, Math.floor(delta.totalTokens ?? (delta.promptTokens + delta.completionTokens)));
  const seconds = Math.max(0, Math.floor(delta.secondsActive));
  const updatedAt = new Date().toISOString();

  const rows = (Object.keys(snapshots) as UsagePeriod[]).map((period) => {
    const snapshot = snapshots[period];
    return {
      user_id: userId,
      period,
      period_start: snapshot.periodStart,
      tokens_used: snapshot.tokensUsed + totalTokens,
      seconds_active: snapshot.secondsActive + seconds,
      runs: snapshot.runs + 1,
      updated_at: updatedAt,
    } satisfies Database["public"]["Tables"]["usage_ledgers"]["Insert"];
  });

  const { error } = await client.from("usage_ledgers").upsert(rows);
  if (error) {
    console.error("applyUsageDelta error", error);
  }
}

export function projectRemaining(
  snapshots: Record<UsagePeriod, UsageSnapshot>,
  deltaTokens: number
): Record<UsagePeriod, { remaining: number; limit: number; after: number }> {
  const total = Math.max(0, deltaTokens);
  const result: Record<UsagePeriod, { remaining: number; limit: number; after: number }> = {
    daily: { remaining: 0, limit: LIMITS.daily, after: 0 },
    weekly: { remaining: 0, limit: LIMITS.weekly, after: 0 },
    monthly: { remaining: 0, limit: LIMITS.monthly, after: 0 },
  };

  for (const period of Object.keys(result) as UsagePeriod[]) {
    const snapshot = snapshots[period];
    const after = snapshot.tokensUsed + total;
    result[period] = {
      remaining: Math.max(0, snapshot.limit - after),
      limit: snapshot.limit,
      after,
    };
  }

  return result;
}
