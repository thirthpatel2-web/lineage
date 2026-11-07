"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SAMPLES = [
  { label: "Look-alike astronaut bunny", src: "/api/demo-art/astronaut-bunny/4242" },
  { label: "Unrelated cat toy", src: "/api/demo-art/tabby-cat/7171" },
];

export function OfferForm({ patterns, aiOn }: { patterns: { id: string; title: string; designer: string }[]; aiOn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; reason?: string; message?: string; score?: number } | null>(null);
  const [sample, setSample] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const body = new FormData(e.currentTarget);
    if (sample) body.set("sample", sample);
    const res = await fetch("/api/offers", { method: "POST", body });
    const json = await res.json();
    setResult(res.ok || res.status === 422 ? json : { ok: false, reason: json.error + (json.issues ? `: ${json.issues.join("; ")}` : "") });
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mt-8 grid gap-4 p-6 md:grid-cols-2">
      <label className="field" htmlFor="patternId">
        <span>Your pattern</span>
        <select id="patternId" name="patternId" className="input" defaultValue="pat_astro_bunny">
          {patterns.map((p) => <option key={p.id} value={p.id}>{p.title} by {p.designer}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="listingUrl"><span>Listing link</span><input id="listingUrl" name="listingUrl" className="input" placeholder="https://…" defaultValue="https://example.com/quickcraftz/space-bunny" /></label>
      <label className="field" htmlFor="sellerName"><span>Seller name</span><input id="sellerName" name="sellerName" className="input" defaultValue="QuickCraftz" required /></label>
      <label className="field" htmlFor="sellerEmail"><span>Seller email (for the PayPal invoice)</span><input id="sellerEmail" name="sellerEmail" type="email" className="input" defaultValue="quickcraftz.seller@example.com" required /></label>
      <label className="field" htmlFor="units"><span>Items to license</span><input id="units" name="units" type="number" min={1} defaultValue={20} className="input" /></label>
      <label className="field" htmlFor="itemPrice"><span>Their price per item (USD)</span><input id="itemPrice" name="itemPrice" type="number" min={1} defaultValue={26} className="input" /></label>
      <div className="field md:col-span-2">
        <span>Photo from the listing</span>
        <input name="photo" type="file" accept="image/*" className="input" aria-label="Photo from the listing" onChange={() => setSample("")} />
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">or use a sample:</span>
          {SAMPLES.map((s) => (
            <button type="button" key={s.src} onClick={() => setSample(s.src)} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 ${sample === s.src ? "border-accent bg-accent-soft" : "border-line"}`}>
              <img src={s.src} alt="" className="size-7 rounded-full object-cover" /> {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button className="btn btn-accent" disabled={busy}>{busy ? "Checking the match…" : "Check & draft offer"}</button>
        {!aiOn && <span className="text-xs text-muted">Demo mode: a standard offer message is used.</span>}
      </div>
      {result && (
        <div className={`rise rounded-xl p-4 md:col-span-2 ${result.ok ? "bg-money-soft" : "bg-warn-soft text-warn"}`}>
          {result.ok ? <p><strong>Draft ready</strong> (match {result.score?.toFixed(2)}). Review it below and approve to send the PayPal invoice.</p> : <p>{result.reason}</p>}
        </div>
      )}
    </form>
  );
}

export function SendButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn btn-paypal w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/offers/${id}/send`, { method: "POST" });
          const json = await res.json();
          if (!res.ok) setError(json.error);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Sending PayPal invoice…" : "Approve & send as PayPal invoice"}
      </button>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}
