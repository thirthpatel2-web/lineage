import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ModelRefusal } from "@/lib/ai/claude";
import { PayPalError } from "@/lib/paypal";
import { RateLimited } from "@/lib/rate-limit";

/** Wrap a route handler so every failure becomes a clear JSON error instead of a stack trace. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown) {
  if (error instanceof RateLimited) return NextResponse.json({ error: error.message }, { status: 429 });
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Some fields are missing or invalid.", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  if (error instanceof PayPalError) {
    console.error("[paypal]", error.message, error.debugId, JSON.stringify(error.details ?? ""));
    return NextResponse.json({ error: error.message, paypalDebugId: error.debugId }, { status: error.status >= 500 ? 502 : 400 });
  }
  if (error instanceof ModelRefusal) {
    return NextResponse.json({ error: `The AI declined: ${error.message}` }, { status: 422 });
  }
  console.error(error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
}
