import type { Metadata } from "next";
import { connection } from "next/server";
import { listPatterns } from "@/lib/queries";
import { mode } from "@/lib/env";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register a pattern" };

export default async function NewPatternPage() {
  await connection();
  const patterns = (await listPatterns()).map((r) => ({ id: r.pattern.id, title: r.pattern.title, designer: r.designer.name }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="eyebrow">For designers</div>
      <h1 className="mt-3 text-5xl font-extrabold">Register a pattern</h1>
      <p className="mt-3 text-muted">
        Add photos of finished items made from your pattern and write your terms in your own words. Lineage reads them, you confirm, and from then on
        makers can license your pattern instead of you filing takedowns. Royalties arrive by PayPal.
      </p>
      <RegisterForm patterns={patterns} aiOn={mode.ai} />
    </div>
  );
}
