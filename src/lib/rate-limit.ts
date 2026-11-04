// Guards the endpoints that spend Claude credits on a public demo: a per-visitor limit, plus a
// daily ceiling across everyone (AI_DAILY_LIMIT). In memory, which is enough for one instance.
import { env, mode } from "@/lib/env";

export class RateLimited extends Error {}

const globalForLimits = globalThis as unknown as { lineageLimits?: { hits: Map<string, number[]>; day: string; spent: number } };

export function checkAiBudget(req: Request, perMinute = 15) {
  if (!mode.ai) return;
  const state = (globalForLimits.lineageLimits ??= { hits: new Map<string, number[]>(), day: "", spent: 0 });
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) Object.assign(state, { day: today, spent: 0, hits: new Map() });
  if (state.spent >= env.aiDailyLimit) throw new RateLimited("The demo has used today's AI allowance. Please try again tomorrow.");

  const visitor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (state.hits.get(visitor) ?? []).filter((t: number) => now - t < 60_000);
  if (recent.length >= perMinute) throw new RateLimited("Too many AI requests. Please wait a minute and try again.");
  recent.push(now);
  state.hits.set(visitor, recent);
  state.spent++;
}
