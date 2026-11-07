// Limits for a public demo. AI endpoints spend Claude credit, so they get a per-visitor limit plus a
// daily ceiling across everyone (AI_DAILY_LIMIT), counted in units of work. Payment endpoints get a
// separate per-visitor limit so nobody can flood PayPal with orders, invoices or payout runs.
// In memory, which is enough for one instance.
import { env, mode } from "@/lib/env";

export class RateLimited extends Error {}

type Window = Map<string, number[]>;
const globalForLimits = globalThis as unknown as { lineageLimits?: { ai: Window; pay: Window; day: string; spent: number } };
const state = () => (globalForLimits.lineageLimits ??= { ai: new Map(), pay: new Map(), day: "", spent: 0 });

/**
 * The visitor's address. Behind Render or Cloudflare the platform header is trustworthy; otherwise
 * the right-most X-Forwarded-For entry is the one our own proxy added, unlike the left-most, which
 * the client can set to anything.
 */
export function visitorOf(req: Request) {
  const platform = req.headers.get("cf-connecting-ip") ?? req.headers.get("true-client-ip");
  if (platform) return platform.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "local";
}

function hit(window: Window, visitor: string, perMinute: number, weight: number, message: string) {
  const now = Date.now();
  // Forget idle visitors so the map can't grow without bound.
  if (window.size > 5000) for (const [k, v] of window) if (now - (v.at(-1) ?? 0) > 60_000) window.delete(k);
  const recent = (window.get(visitor) ?? []).filter((t) => now - t < 60_000);
  if (recent.length + weight > perMinute) throw new RateLimited(message);
  for (let i = 0; i < weight; i++) recent.push(now);
  window.set(visitor, recent);
}

/** `units`: roughly how many Claude calls this request can make (an agent run makes several). */
export function checkAiBudget(req: Request, perMinute = 15, units = 1) {
  if (!mode.ai) return;
  const s = state();
  const today = new Date().toISOString().slice(0, 10);
  if (s.day !== today) Object.assign(s, { day: today, spent: 0, ai: new Map(), pay: new Map() });
  if (s.spent + units > env.aiDailyLimit) throw new RateLimited("The demo has used today's AI allowance. Please try again tomorrow.");
  hit(s.ai, visitorOf(req), perMinute, units, "Too many AI requests. Please wait a minute and try again.");
  s.spent += units;
}

export function checkPaymentRate(req: Request, perMinute = 20) {
  hit(state().pay, visitorOf(req), perMinute, 1, "Too many payment requests. Please wait a minute and try again.");
}
