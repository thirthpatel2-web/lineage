import { NextResponse } from "next/server";
import { env, mode } from "@/lib/env";
import { simulatePayerApproval } from "@/lib/paypal";

export const runtime = "nodejs";

// Offline mode only: stands in for the payer clicking "Pay" on PayPal.
export async function POST(req: Request) {
  if (mode.paypal) return NextResponse.json({ error: "Simulation is off: real PayPal keys are configured." }, { status: 404 });
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const returnUrl = String(form.get("return") ?? "");
  let next: URL;
  try {
    next = new URL(returnUrl);
  } catch {
    return NextResponse.json({ error: "Bad return URL" }, { status: 400 });
  }
  if (next.origin !== new URL(env.appUrl).origin) return NextResponse.json({ error: "Bad return URL" }, { status: 400 });
  simulatePayerApproval(token);
  next.searchParams.set("token", token);
  return NextResponse.redirect(next, 303);
}
