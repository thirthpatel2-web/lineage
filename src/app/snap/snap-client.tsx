"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LineageTree } from "@/components/lineage-tree";
import { formatCents, licenseAmount, splitRoyalty } from "@/lib/money";
import type { MatchCandidate } from "@/lib/db/schema";

type Node = {
  id: string;
  title: string;
  designer: string;
  parentShareBp: number;
  rateBp: number;
  minCents: number;
  salesAllowed: boolean;
  creditRequired: boolean;
  batchLimit: number | null;
  licenseText: string | null;
  imageId?: string | null;
};

type Match = {
  id: string;
  imageId: string;
  band: "strong" | "possible" | "none" | "traditional";
  candidates: MatchCandidate[];
  traditionalReason: string | null;
  verifiedBy: "vision" | "embedding";
  lineage: Node[];
};

const SAMPLES = [
  { label: "Astronaut bunny", src: "/api/demo-art/astronaut-bunny/3131" },
  { label: "Clover bunny", src: "/api/demo-art/clover-bunny/3232" },
  { label: "Octopus", src: "/api/demo-art/lighthouse-octopus/3333" },
  { label: "Frog", src: "/api/demo-art/fern-frog/3434" },
  { label: "Granny square", src: "/api/demo-art/granny-square/3535" },
  { label: "Cat (unregistered)", src: "/api/demo-art/tabby-cat/3636" },
];

export function SnapClient({ makers, feeBp, aiOn, aiName, paypalLive }: { makers: { id: string; name: string; shopName: string }[]; feeBp: number; aiOn: boolean; aiName: string; paypalLive: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [lineage, setLineage] = useState<Node[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();

  // /snap?sample=astronaut starts the demo with one click from the home page.
  useEffect(() => {
    const sample = SAMPLES.find((s) => s.src.includes(`/${params.get("sample")}-`));
    if (sample) onSample(sample.src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyse(body: FormData, previewUrl: string) {
    setPreview(previewUrl);
    setBusy(true);
    setError(null);
    setMatch(null);
    try {
      const res = await fetch("/api/match", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Matching failed");
      setMatch(json);
      setLineage(json.lineage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.set("photo", file);
    analyse(body, URL.createObjectURL(file));
  }

  function onSample(src: string) {
    const body = new FormData();
    body.set("sample", src);
    analyse(body, src);
  }

  async function choose(candidate: MatchCandidate) {
    const res = await fetch(`/api/patterns/${candidate.patternId}`);
    const json = await res.json();
    if (res.ok) setLineage(json.lineage);
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col gap-4">
        <div
          className="card grid aspect-square max-h-[520px] w-full place-items-center overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
        >
          {preview ? (
            <img src={preview} alt="Your finished item" className={`h-full w-full object-cover ${busy ? "animate-pulse" : ""}`} />
          ) : (
            <div className="p-8 text-center text-muted">
              <div className="font-display text-2xl font-bold text-ink">Drop a photo here</div>
              <p className="mt-2">or take one with your phone. Good light, the whole item in frame.</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <input ref={fileRef} id="photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-accent" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Looking for the pattern…" : preview ? "Try another photo" : "Take or choose a photo"}
          </button>
        </div>
        <div>
          <div className="mb-2 text-sm text-muted">No crochet nearby? Try a sample (demo illustrations):</div>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button key={s.src} onClick={() => onSample(s.src)} disabled={busy} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm hover:border-accent">
                <img src={s.src} alt="" className="size-7 rounded-full object-cover" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {!aiOn && (
          <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
            Demo mode: Lineage is matching by overall look only. With an AI vision model on, it also checks construction details, so it tells a remix from its original more reliably.
          </p>
        )}
      </section>

      <section aria-live="polite" className="flex min-w-0 flex-col gap-5">
        {error && <div className="rounded-xl bg-accent-soft p-4 text-accent">{error}</div>}
        {busy && <Thinking aiOn={aiOn} aiName={aiName} />}
        {!busy && !match && !error && (
          <div className="card p-6 text-muted">
            Your result appears here: the pattern, its designers, their terms, and the license price.
          </div>
        )}
        {match && !busy && <Result aiName={aiName} match={match} lineage={lineage} onChoose={choose} makers={makers} feeBp={feeBp} paypalLive={paypalLive} />}
      </section>
    </div>
  );
}

function Thinking({ aiOn, aiName }: { aiOn: boolean; aiName: string }) {
  return (
    <div className="card flex flex-col gap-3 p-6">
      <div className="font-display text-xl font-bold">Finding the pattern…</div>
      <ol className="flex flex-col gap-2 text-sm text-muted">
        <li>1. Comparing with every registered pattern photo</li>
        <li>2. {aiOn ? `${aiName} is checking construction details` : "Scoring visual similarity"}</li>
        <li>3. Tracing the remix lineage</li>
      </ol>
    </div>
  );
}

function bandPill(band: Match["band"]) {
  if (band === "strong") return <span className="pill pill-good">Strong match</span>;
  if (band === "possible") return <span className="pill pill-warn">Possible match</span>;
  if (band === "traditional") return <span className="pill pill-plain">Traditional design</span>;
  return <span className="pill pill-plain">No match</span>;
}

function Result({ aiName, match, lineage, onChoose, makers, feeBp, paypalLive }: { aiName: string; match: Match; lineage: Node[]; onChoose: (c: MatchCandidate) => void; makers: { id: string; name: string; shopName: string }[]; feeBp: number; paypalLive: boolean }) {
  const top = match.candidates[0];
  if (match.band === "traditional") {
    return (
      <div className="card rise p-6">
        {bandPill(match.band)}
        <h2 className="mt-3 text-3xl font-extrabold">No license needed</h2>
        <p className="mt-2 text-muted">{match.traditionalReason} Classic designs like this belong to everyone, so Lineage will never charge for them.</p>
      </div>
    );
  }
  if (match.band === "none" || !top) {
    return (
      <div className="card rise p-6">
        {bandPill("none")}
        <h2 className="mt-3 text-3xl font-extrabold">No registered pattern matches</h2>
        <p className="mt-2 text-muted">Nobody has registered a pattern that looks like this. If it&apos;s your own design, you can register it and earn when others make it.</p>
        <a href="/designers/new" className="btn btn-ghost mt-4">Register a pattern</a>
      </div>
    );
  }
  const chosen = lineage[0];
  return (
    <>
      <div className="card rise p-6">
        <div className="flex flex-wrap items-center gap-2">
          {bandPill(match.band)}
          <span className="pill pill-plain">{match.verifiedBy === "vision" ? `Checked by ${aiName} vision` : "Image similarity only"}</span>
        </div>
        <h2 className="mt-3 text-3xl font-extrabold">
          {top.title} <span className="text-muted">by {top.designer}</span>
        </h2>
        <p className="mt-2 text-muted">{top.explanation}</p>
        <div className="mt-4 flex flex-col gap-2.5">
          {top.features.map((f) => (
            <div key={f.name} className="grid grid-cols-[1fr_3rem] items-center gap-x-3 gap-y-1 text-sm">
              <span>{f.name}</span>
              <span className="text-right font-mono tabular-nums">{Math.round(f.score * 100)}%</span>
              <div className="bar-track col-span-2"><div className="bar-fill" style={{ width: `${f.score * 100}%` }} /></div>
            </div>
          ))}
        </div>
        {match.candidates.length > 1 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted">Not right? Other possibilities</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {match.candidates.slice(1).map((c) => (
                <li key={c.patternId} className="flex items-center justify-between gap-3 rounded-lg bg-sunk p-2">
                  <span>{c.title} · {c.designer} <span className="font-mono text-muted">({Math.round(c.score * 100)}% match)</span></span>
                  <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => onChoose(c)}>Use this</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {lineage.length > 0 && (
        <div className="card rise p-6">
          <h3 className="text-xl font-bold">Lineage</h3>
          <p className="mb-4 text-sm text-muted">Everyone who designed what you made. Each of them gets paid.</p>
          <LineageTree chain={lineage} item={{ label: "Your item", imageId: match.imageId }} highlight={chosen?.id} />
        </div>
      )}

      {chosen && <LicenseForm key={chosen.id} chain={lineage} matchId={match.id} makers={makers} feeBp={feeBp} paypalLive={paypalLive} />}
    </>
  );
}

function LicenseForm({ chain, matchId, makers, feeBp, paypalLive }: { chain: Node[]; matchId: string; makers: { id: string; name: string; shopName: string }[]; feeBp: number; paypalLive: boolean }) {
  const pattern = chain[0];
  const [units, setUnits] = useState(10);
  const [price, setPrice] = useState(40);
  const [makerId, setMakerId] = useState(makers[0]?.id ?? "new");
  const [newMaker, setNewMaker] = useState({ name: "", shopName: "", paypalEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = useMemo(() => {
    const itemCents = Math.round(price * 100);
    if (!pattern.salesAllowed || !Number.isInteger(units) || units < 1 || units > 500 || !(itemCents >= 100)) return null;
    const amount = licenseAmount(itemCents, pattern.rateBp, pattern.minCents, units);
    const credits = splitRoyalty(amount, chain.map((p) => ({ patternId: p.id, designerId: p.id, parentShareBp: p.parentShareBp })), feeBp);
    return { amount, credits };
  }, [price, units, pattern, chain, feeBp]);

  if (!pattern.salesAllowed) {
    return (
      <div className="card rise border-accent p-6">
        <span className="pill pill-bad">Not for sale</span>
        <h3 className="mt-3 text-2xl font-bold">{pattern.designer} doesn&apos;t allow selling finished items</h3>
        <p className="mt-2 text-muted">&ldquo;{pattern.licenseText}&rdquo;</p>
        <p className="mt-2 text-muted">You can still make it for yourself or as a gift. Lineage won&apos;t sell a license the designer hasn&apos;t offered.</p>
      </div>
    );
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId: pattern.id, matchId, units, itemPriceCents: Math.round(price * 100), maker: makerId === "new" ? newMaker : { id: makerId } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? (json.issues ?? []).join(", "));
      window.location.href = json.approveUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const over = pattern.batchLimit && units > pattern.batchLimit;
  return (
    <div className="card rise p-6">
      <h3 className="text-xl font-bold">License to sell</h3>
      <p className="mt-1 text-sm text-muted">
        {pattern.designer}&apos;s terms: &ldquo;{pattern.licenseText}&rdquo;
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="field" htmlFor="units">
          <span>Items you&apos;ll sell</span>
          <input id="units" className="input" type="number" min={1} max={500} value={units} onChange={(e) => setUnits(Number(e.target.value))} />
          {pattern.batchLimit && <small className={over ? "text-accent" : "text-muted"}>Designer allows up to {pattern.batchLimit}</small>}
        </label>
        <label className="field" htmlFor="price">
          <span>Price per item (USD)</span>
          <input id="price" className="input" type="number" min={1} step={1} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          <small className="text-muted">{pattern.rateBp / 100}% royalty, at least {formatCents(pattern.minCents)} per item</small>
        </label>
        <label className="field sm:col-span-2" htmlFor="maker">
          <span>You are</span>
          <select id="maker" className="input" value={makerId} onChange={(e) => setMakerId(e.target.value)}>
            {makers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} · {m.shopName} (demo)</option>
            ))}
            <option value="new">Someone new…</option>
          </select>
        </label>
        {makerId === "new" && (
          <>
            <input className="input" aria-label="Your name" placeholder="Your name" value={newMaker.name} onChange={(e) => setNewMaker({ ...newMaker, name: e.target.value })} />
            <input className="input" aria-label="Shop name" placeholder="Shop name" value={newMaker.shopName} onChange={(e) => setNewMaker({ ...newMaker, shopName: e.target.value })} />
            <input className="input sm:col-span-2" aria-label="PayPal email" placeholder="PayPal email" type="email" value={newMaker.paypalEmail} onChange={(e) => setNewMaker({ ...newMaker, paypalEmail: e.target.value })} />
          </>
        )}
      </div>

      {quote && (
        <div className="mt-5 rounded-xl bg-sunk p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-muted">License total</span>
            <span className="font-display text-3xl font-extrabold tabular-nums">{formatCents(quote.amount)}</span>
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {quote.credits.map((c) => (
              <li key={`${c.payeeKind}-${c.payeeId}`} className="flex justify-between">
                <span>{c.payeeKind === "platform" ? "Lineage fee" : `${chain.find((p) => p.id === c.payeeId)?.designer} · ${chain.find((p) => p.id === c.payeeId)?.title}`}</span>
                <span className="font-mono tabular-nums">{formatCents(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      <button className="btn btn-paypal mt-5 w-full text-base" disabled={busy || !quote || Boolean(over)} onClick={pay}>
        {busy ? "Opening PayPal…" : `Pay ${quote ? formatCents(quote.amount) : ""} with PayPal`}
      </button>
      <p className="mt-2 text-center text-xs text-muted">{paypalLive ? "PayPal sandbox: use a sandbox buyer account." : "Simulated PayPal (no keys set): no account needed."}</p>
    </div>
  );
}
