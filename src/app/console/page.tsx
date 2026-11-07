import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getConsoleData } from "@/lib/console-data";
import { mode } from "@/lib/env";
import { RoyaltyConsole } from "./royalty-console";

export const metadata: Metadata = { title: "Royalties" };

export default async function ConsolePage() {
  await connection();
  const data = await getConsoleData();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Royalty console</div>
          <h1 className="mt-3 text-5xl font-extrabold">Who is owed, who got paid</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Every royalty Lineage records, written only after PayPal confirms a capture, and every PayPal Payouts batch that settled it.
          </p>
        </div>
        <Link href="/console/studio" className="btn btn-accent">Open charts (AG Studio)</Link>
      </div>
      <RoyaltyConsole data={data} paypalLive={mode.paypal} />
    </div>
  );
}
