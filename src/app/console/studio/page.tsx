import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getConsoleData } from "@/lib/console-data";
import { env, mode } from "@/lib/env";
import { StudioLoader } from "./studio-loader";

export const metadata: Metadata = { title: "AG Studio dashboard" };

export default async function StudioPage() {
  await connection();
  const data = await getConsoleData();
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[640px] flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <div className="eyebrow">AG Studio · Claude assistant</div>
          <h1 className="text-3xl font-extrabold">Royalty dashboard</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          {mode.ai ? <span className="pill pill-good">Ask Claude to build charts</span> : <span className="pill pill-warn">AI assistant needs ANTHROPIC_API_KEY</span>}
          <Link href="/console" className="btn btn-ghost">Back to console</Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 border-t border-line">
        <StudioLoader data={data} licenseKey={env.agStudioKey} aiOn={mode.ai} />
      </div>
    </div>
  );
}
