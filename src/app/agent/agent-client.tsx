"use client";

import { useState } from "react";

type Step = { kind: "thought" | "tool" | "error"; name?: string; input?: unknown; output?: unknown; text?: string };
type Run = { id: string; steps: Step[]; result: string; approveUrl?: string; scripted: boolean };

const SUGGESTIONS = [
  "Find a licensed astronaut bunny under $45 for my niece and buy it",
  "I want a crochet frog with a leaf hat. Is there a licensed one?",
  "Find me a handmade octopus gift under $40",
];

const TOOL_LABEL: Record<string, string> = {
  find_licensed_items: "Searched marketplaces",
  check_provenance: "Checked provenance",
  get_license_terms: "Read license terms",
  quote_license: "Priced a license",
  buy_license: "Prepared license checkout",
  buy_item: "Prepared PayPal checkout",
};

export function AgentClient({ aiOn }: { aiOn: boolean }) {
  const [prompt, setPrompt] = useState(SUGGESTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(text = prompt) {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/agent/shop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRun(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-4">
        <form
          className="card flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <label htmlFor="prompt" className="font-bold">Ask the shopping agent</label>
          <textarea id="prompt" className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button className="btn btn-accent" disabled={busy || prompt.trim().length < 3}>{busy ? "Agent is working…" : "Run agent"}</button>
          {!aiOn && <p className="text-xs text-muted">Demo mode: the agent follows a fixed script, using the same tools.</p>}
        </form>
        <div className="flex flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="rounded-xl border border-line bg-surface p-3 text-left text-sm hover:border-accent" onClick={() => { setPrompt(s); go(s); }} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
        {error && <div className="rounded-xl bg-accent-soft p-4 text-accent">{error}</div>}
        {busy && (
          <div className="card p-6">
            <div className="font-display text-xl font-bold">Working…</div>
            <p className="mt-1 text-sm text-muted">Searching, then checking each outside listing&apos;s photo against registered patterns.</p>
          </div>
        )}
        {!busy && !run && !error && <div className="card p-6 text-muted">The agent&apos;s steps and answer appear here.</div>}
        {run && (
          <>
            <ol className="flex flex-col gap-2">
              {run.steps.map((s, i) => <StepRow key={i} step={s} />)}
            </ol>
            <div className="card rise border-accent p-5">
              <div className="flex items-center gap-2">
                <span className="pill pill-good">Answer</span>
                <span className="pill pill-plain">{run.scripted ? "Demo script" : "Claude Opus 5.5"}</span>
              </div>
              <Recommendation run={run} />
              <details className="mt-3 text-sm text-muted">
                <summary className="cursor-pointer">The agent&apos;s full answer</summary>
                <p className="mt-2 whitespace-pre-wrap">{run.result.replace(run.approveUrl ?? "\u0000", "the link below")}</p>
              </details>
              {run.approveUrl && (
                <a href={run.approveUrl} className="btn btn-paypal mt-4 w-full text-base">Review &amp; approve in PayPal</a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  if (step.kind === "thought") return <li className="rounded-xl bg-sunk p-3 text-sm italic text-muted">{step.text}</li>;
  if (step.kind === "error") return <li className="rounded-xl bg-accent-soft p-3 text-sm text-accent">{step.text}</li>;
  const out = step.output as Record<string, unknown> | undefined;
  const verdict =
    step.name === "check_provenance" && out
      ? out.licensed === false
        ? { cls: "pill-bad", text: "Unlicensed copy: skipped" }
        : out.licensed === true
          ? { cls: "pill-good", text: "Licensed" }
          : { cls: "pill-plain", text: "No registered pattern" }
      : null;
  const input = step.input as { image_url?: string } | undefined;
  return (
    <li className="card rise p-3">
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3">
          {input?.image_url && <img src={input.image_url} alt="" className="size-10 rounded-lg object-cover" />}
          <span className="font-mono text-xs text-muted">{step.name}</span>
          <span className="font-bold">{TOOL_LABEL[step.name ?? ""] ?? step.name}</span>
          {verdict && <span className={`pill ${verdict.cls} ml-auto`}>{verdict.text}</span>}
        </summary>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-sunk p-3 font-mono text-xs">{JSON.stringify({ input: step.input, output: step.output }, null, 2)}</pre>
      </details>
    </li>
  );
}

type Found = { lineage_market?: { listing_id: string; title: string; price: string; maker: string; pattern: string; image_url: string }[]; other_marketplaces?: { title: string; image_url?: string }[] };

// The item the agent chose, and what it refused, at a glance.
function Recommendation({ run }: { run: Run }) {
  const found = run.steps.find((s) => s.name === "find_licensed_items")?.output as Found | undefined;
  const bought = run.steps.find((s) => s.name === "buy_item")?.input as { listing_id?: string } | undefined;
  const pick = found?.lineage_market?.find((l) => l.listing_id === bought?.listing_id) ?? (bought ? undefined : found?.lineage_market?.[0]);
  const skipped = run.steps.filter((s) => s.name === "check_provenance" && (s.output as { licensed?: boolean } | undefined)?.licensed === false);
  if (!pick && skipped.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-3">
      {pick && (
        <div className="flex items-center gap-4 rounded-xl bg-sunk p-3">
          <img src={pick.image_url} alt={pick.title} className="size-20 rounded-lg object-cover" />
          <div className="min-w-0">
            <div className="font-display text-lg font-bold">{pick.title}</div>
            <div className="text-sm text-muted">{pick.maker} · {pick.price}</div>
            <div className="text-sm text-money">Licensed: {pick.pattern}, royalty included</div>
          </div>
        </div>
      )}
      {skipped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="pill pill-bad">Skipped {skipped.length} unlicensed {skipped.length === 1 ? "copy" : "copies"}</span>
          {skipped.map((s, i) => {
            const url = (s.input as { image_url?: string } | undefined)?.image_url;
            return url ? <img key={i} src={url} alt="Unlicensed copy" className="size-9 rounded-md object-cover opacity-70" /> : null;
          })}
        </div>
      )}
    </div>
  );
}
