import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { mode } from "@/lib/env";

export const metadata: Metadata = { title: "Simulated PayPal" };

// Offline mode only. With sandbox keys set, payers go to the real PayPal sandbox instead.
export default async function SimPayPal({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (mode.paypal) notFound();
  const p = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card overflow-hidden">
        <div className="bg-[#ffc439] px-6 py-4 font-display text-xl font-extrabold text-[#111]">PayPal · simulated</div>
        <div className="flex flex-col gap-4 p-6">
          <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">
            No PayPal keys are configured, so this page stands in for PayPal&apos;s approval screen. Add sandbox keys to use the real PayPal sandbox.
          </p>
          <div className="text-sm text-muted">{p.description}</div>
          <div className="font-display text-4xl font-extrabold tabular-nums">${p.amount} <span className="text-base text-muted">USD</span></div>
          <form action="/api/sim/approve" method="post" className="flex flex-col gap-2">
            <input type="hidden" name="token" value={p.token} />
            <input type="hidden" name="return" value={p.return} />
            <button className="btn btn-paypal w-full text-base">Pay now</button>
          </form>
          <a href={p.cancel} className="text-center text-sm text-muted underline">Cancel and return</a>
        </div>
      </div>
    </div>
  );
}
