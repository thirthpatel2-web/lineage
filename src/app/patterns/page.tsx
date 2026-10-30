import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listPatterns } from "@/lib/queries";

export const metadata: Metadata = { title: "Patterns" };

export default async function PatternsPage() {
  await connection();
  const rows = await listPatterns();
  const byId = new Map(rows.map((r) => [r.pattern.id, r]));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Registry</div>
          <h1 className="mt-3 text-5xl font-extrabold">Patterns</h1>
          <p className="mt-2 text-muted">Every pattern designers have registered, with its license terms and remix lineage.</p>
        </div>
        <Link href="/designers/new" className="btn btn-accent">Register a pattern</Link>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ pattern, designer, imageId }) => {
          const parent = pattern.parentId ? byId.get(pattern.parentId) : undefined;
          return (
            <Link key={pattern.id} href={`/patterns/${pattern.id}`} className="card group overflow-hidden transition hover:border-accent">
              {imageId && <img src={`/api/images/${imageId}`} alt="" className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" />}
              <div className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap gap-2">
                  {parent ? <span className="pill pill-bad">Remix of {parent.pattern.title}</span> : <span className="pill pill-plain">Original</span>}
                  {pattern.salesAllowed ? <span className="pill pill-good">{pattern.rateBp / 100}% license</span> : <span className="pill pill-warn">Personal use only</span>}
                  {designer.demo && <span className="pill pill-plain">demo</span>}
                </div>
                <div className="font-display text-xl font-bold">{pattern.title}</div>
                <div className="text-sm text-muted">by {designer.name}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
