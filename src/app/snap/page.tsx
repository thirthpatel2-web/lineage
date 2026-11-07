import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb, schema } from "@/lib/db";
import { env, mode } from "@/lib/env";
import { SnapClient } from "./snap-client";

export const metadata: Metadata = { title: "Snap & license" };

export default async function SnapPage() {
  await connection();
  const db = await getDb();
  const makers = await db.select({ id: schema.makers.id, name: schema.makers.name, shopName: schema.makers.shopName }).from(schema.makers);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="eyebrow">For makers</div>
      <h1 className="mt-3 text-5xl font-extrabold">Snap &amp; license</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Photograph something you made. Lineage finds the pattern and everyone who designed it, shows their terms, and licenses it with one PayPal payment.
      </p>
      <Suspense>
        <SnapClient makers={makers} feeBp={env.platformFeeBp} aiOn={mode.ai} paypalLive={mode.paypal} />
      </Suspense>
    </div>
  );
}
