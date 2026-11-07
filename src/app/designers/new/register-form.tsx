"use client";

import { useState } from "react";

type Terms = { sales_allowed: boolean; credit_required: boolean; batch_limit: number | null; suggested_rate_percent: number; summary: string; notes: string[]; source: "ai" | "default" };

export function RegisterForm({ patterns, aiOn }: { patterns: { id: string; title: string; designer: string }[]; aiOn: boolean }) {
  const [licenseText, setLicenseText] = useState("You can sell finished items made from this pattern if you credit me. 8% of the sale price is fair.");
  const [terms, setTerms] = useState<Terms | null>(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentId, setParentId] = useState("");
  const [files, setFiles] = useState<string[]>([]);

  async function read() {
    setReading(true);
    setError(null);
    const res = await fetch("/api/license/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: licenseText }) });
    const json = await res.json();
    if (res.ok) setTerms(json);
    else setError(json.error);
    setReading(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!terms) return setError("Read your terms first so you can confirm them.");
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/patterns", { method: "POST", body: new FormData(e.currentTarget) });
    const json = await res.json();
    if (res.ok) window.location.href = `/patterns/${json.id}`;
    else {
      setError(json.error + (json.issues ? `: ${json.issues.join("; ")}` : ""));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
      <fieldset className="card grid gap-4 p-6 sm:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold">You</legend>
        <label className="field" htmlFor="designerName"><span>Name</span><input id="designerName" name="designerName" className="input" required /></label>
        <label className="field" htmlFor="paypalEmail"><span>PayPal email (royalties go here)</span><input id="paypalEmail" name="paypalEmail" type="email" className="input" required /></label>
      </fieldset>

      <fieldset className="card grid gap-4 p-6">
        <legend className="px-1 font-display text-lg font-bold">Your pattern</legend>
        <label className="field" htmlFor="title"><span>Title</span><input id="title" name="title" className="input" required placeholder="e.g. Clover Bunny" /></label>
        <label className="field" htmlFor="description"><span>What makes it distinctive</span><textarea id="description" name="description" className="input" rows={2} placeholder="Tall lined ears, clover on the belly…" /></label>
        <label className="field" htmlFor="photos">
          <span>Photos of finished items (1-6)</span>
          <input id="photos" name="photos" type="file" accept="image/*" multiple required className="input" onChange={(e) => setFiles([...(e.target.files ?? [])].map((f) => URL.createObjectURL(f)))} />
          <small className="text-muted">Different angles and colours help Lineage recognise makers&apos; versions.</small>
        </label>
        {files.length > 0 && (
          <div className="flex gap-2">{files.map((f) => <img key={f} src={f} alt="" className="size-20 rounded-lg object-cover" />)}</div>
        )}
        <label className="field" htmlFor="parentId">
          <span>Is it a remix of another pattern?</span>
          <select id="parentId" name="parentId" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">No, it&apos;s original</option>
            {patterns.map((p) => <option key={p.id} value={p.id}>{p.title} by {p.designer}</option>)}
          </select>
        </label>
        {parentId && (
          <label className="field" htmlFor="parentSharePercent">
            <span>Share of your royalties that goes to the original&apos;s designer (%)</span>
            <input id="parentSharePercent" name="parentSharePercent" type="number" min={0} max={100} defaultValue={30} className="input" />
          </label>
        )}
      </fieldset>

      <fieldset className="card grid gap-4 p-6">
        <legend className="px-1 font-display text-lg font-bold">Your terms, in your words</legend>
        <textarea name="licenseText" className="input" rows={3} value={licenseText} onChange={(e) => { setLicenseText(e.target.value); setTerms(null); }} aria-label="Your terms" />
        <button type="button" className="btn btn-ghost justify-self-start" onClick={read} disabled={reading}>
          {reading ? "Reading…" : aiOn ? "Read my terms with AI" : "Read my terms"}
        </button>
        {terms && (
          <div className="rise grid gap-4 rounded-xl bg-sunk p-4 sm:grid-cols-2">
            <p className="sm:col-span-2"><strong>{terms.summary}</strong> {terms.source === "ai" ? <span className="pill pill-good">read by AI</span> : <span className="pill pill-warn">defaults</span>}</p>
            {terms.notes.length > 0 && <ul className="text-sm text-warn sm:col-span-2">{terms.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
            <label className="field" htmlFor="salesAllowed"><span>Selling finished items</span>
              <select id="salesAllowed" name="salesAllowed" className="input" defaultValue={String(terms.sales_allowed)}><option value="true">Allowed</option><option value="false">Not allowed</option></select>
            </label>
            <label className="field" htmlFor="creditRequired"><span>Credit</span>
              <select id="creditRequired" name="creditRequired" className="input" defaultValue={String(terms.credit_required)}><option value="true">Required</option><option value="false">Optional</option></select>
            </label>
            <label className="field" htmlFor="ratePercent"><span>Royalty (% of item price)</span><input id="ratePercent" name="ratePercent" type="number" step="0.5" min={0} max={50} defaultValue={terms.suggested_rate_percent} className="input" /></label>
            <label className="field" htmlFor="batchLimit"><span>Max items per maker (blank = no limit)</span><input id="batchLimit" name="batchLimit" type="number" min={1} defaultValue={terms.batch_limit ?? ""} className="input" /></label>
            <input type="hidden" name="minDollars" value="1" />
          </div>
        )}
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-[var(--accent)]" />
        <span>I designed this pattern (or the remix), and I agree to receive royalties through PayPal Payouts.</span>
      </label>
      {error && <p className="rounded-xl bg-accent-soft p-3 text-accent">{error}</p>}
      <button className="btn btn-accent text-base" disabled={submitting}>{submitting ? "Registering… (computing photo fingerprints)" : "Register pattern"}</button>
    </form>
  );
}
