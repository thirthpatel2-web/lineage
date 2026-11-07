"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import type { ConsoleData } from "@/lib/console-data";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  headerFontFamily: "inherit",
  accentColor: "var(--accent)",
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--sunk)",
  oddRowBackgroundColor: "var(--bg)",
  rowHoverColor: "var(--accent-soft)",
  wrapperBorderRadius: 14,
});

const money = (p: { value: number | null | undefined }) => (p.value == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.value));
const when = (p: { value: string | null | undefined }) => (p.value ? new Date(p.value).toLocaleString() : "");
const STATUS_CLASS: Record<string, string> = { kept: "pill-plain", paid: "pill-good", SUCCESS: "pill-good", captured: "pill-good", pending: "pill-warn", in_batch: "pill-plain", unclaimed: "pill-warn", UNCLAIMED: "pill-warn", created: "pill-warn", failed: "pill-bad", FAILED: "pill-bad" };
const statusCell = (p: { value: string }) => <span className={`pill ${STATUS_CLASS[p.value] ?? "pill-plain"}`}>{p.value?.replace("_", " ")}</span>;

type Tab = "credits" | "payouts" | "licenses" | "sales";

export function RoyaltyConsole({ data, paypalLive }: { data: ConsoleData; paypalLive: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("credits");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totals = useMemo(() => {
    const sum = (rows: { amount: number }[]) => rows.reduce((t, r) => t + r.amount, 0);
    const people = data.credits.filter((c) => c.payeeKind !== "platform");
    return {
      owed: sum(people.filter((c) => c.status === "pending")),
      inFlight: sum(people.filter((c) => c.status === "in_batch")),
      paid: sum(people.filter((c) => c.status === "paid")),
      unclaimed: sum(people.filter((c) => c.status === "unclaimed")),
      designers: sum(people.filter((c) => c.payeeKind === "designer")),
    };
  }, [data]);

  async function act(path: string, label: string) {
    setBusy(label);
    setMessage(null);
    try {
    const res = await fetch(path, { method: "POST" });
    const json = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    if (!res.ok) setMessage(json.error ?? "Failed");
    else if ("captures" in json) setMessage(json.live ? `Checked ${json.captures} payments against PayPal: ${json.matched} matched, ${json.notListedYet} not listed yet (PayPal's search can lag by hours), ${json.amountMismatches.length} amount mismatches.` : "Reconciliation compares with PayPal's records, so it needs sandbox keys.");
    else if (json.batch === null) setMessage(`Nobody has reached the $1.00 payout minimum yet.`);
    else if (json.batch) setMessage(`Sent PayPal Payouts batch ${json.batch.senderBatchId}: ${json.batch.items} payees, $${(json.batch.totalCents / 100).toFixed(2)}.`);
    else setMessage(`Refreshed ${json.refreshed} batch(es) from PayPal${json.paidOffers ? `, ${json.paidOffers} invoice(s) newly paid` : ""}${json.failed ? `; ${json.failed} could not be read` : ""}.`);
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const columns: Record<Tab, ColDef[]> = {
    credits: [
      { field: "date", headerName: "Recorded", valueFormatter: when, sort: "desc", minWidth: 170 },
      { field: "payee", headerName: "Payee", filter: true },
      { field: "payeeKind", headerName: "Role", filter: true, maxWidth: 120 },
      { field: "pattern", headerName: "Pattern", filter: true },
      { field: "source", headerName: "From", maxWidth: 110 },
      { field: "amount", headerName: "Amount", valueFormatter: money, type: "rightAligned", maxWidth: 130 },
      { field: "status", headerName: "Status", cellRenderer: statusCell, filter: true, maxWidth: 140 },
      { field: "batch", headerName: "Payout batch", minWidth: 160 },
    ],
    payouts: [
      { field: "date", headerName: "Sent", valueFormatter: when, sort: "desc", minWidth: 170 },
      { field: "batch", headerName: "Batch", minWidth: 160 },
      { field: "payee", headerName: "Payee", filter: true },
      { field: "receiver", headerName: "PayPal email" },
      { field: "amount", headerName: "Amount", valueFormatter: money, type: "rightAligned", maxWidth: 130 },
      { field: "status", headerName: "PayPal status", cellRenderer: statusCell, maxWidth: 150 },
      { field: "paypalItemId", headerName: "PayPal item id" },
    ],
    licenses: [
      { field: "date", headerName: "Date", valueFormatter: when, sort: "desc", minWidth: 170 },
      { field: "maker", headerName: "Maker", filter: true },
      { field: "pattern", headerName: "Pattern", filter: true },
      { field: "units", headerName: "Items", type: "rightAligned", maxWidth: 100 },
      { field: "amount", headerName: "Paid", valueFormatter: money, type: "rightAligned", maxWidth: 120 },
      { field: "source", headerName: "Via", maxWidth: 100 },
      { field: "status", headerName: "Status", cellRenderer: statusCell, maxWidth: 130 },
      { field: "captureId", headerName: "PayPal capture" },
    ],
    sales: [
      { field: "date", headerName: "Date", valueFormatter: when, sort: "desc", minWidth: 170 },
      { field: "item", headerName: "Item", filter: true },
      { field: "pattern", headerName: "Pattern" },
      { field: "amount", headerName: "Price", valueFormatter: money, type: "rightAligned", maxWidth: 120 },
      { field: "source", headerName: "Via", maxWidth: 100 },
      { field: "status", headerName: "Status", cellRenderer: statusCell, maxWidth: 130 },
      { field: "captureId", headerName: "PayPal capture" },
    ],
  };
  const rows = { credits: data.credits, payouts: data.payouts, licenses: data.licenses, sales: data.sales }[tab];

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-5">
        <Kpi k="Owed, next payout" v={totals.owed} tone="text-warn" />
        <Kpi k="In a PayPal batch" v={totals.inFlight} />
        <Kpi k="Paid by PayPal" v={totals.paid} tone="text-money" />
        <Kpi k="Waiting for designer to claim" v={totals.unclaimed} />
        <Kpi k="Designers earned, all time" v={totals.designers} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-accent" disabled={busy !== null} onClick={() => act("/api/payouts/run", "run")}>
          {busy === "run" ? "Sending PayPal Payouts…" : "Run payouts now"}
        </button>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={() => act("/api/payouts/refresh", "refresh")}>
          {busy === "refresh" ? "Checking PayPal…" : "Refresh statuses from PayPal"}
        </button>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={() => act("/api/payouts/reconcile", "reconcile")}>
          {busy === "reconcile" ? "Comparing with PayPal…" : "Reconcile with PayPal"}
        </button>
        <span className="text-sm text-muted">{paypalLive ? "PayPal sandbox: test money only" : "Demo mode: PayPal stand-in"}</span>
        {message && <span className="rounded-lg bg-sunk px-3 py-1.5 text-sm">{message}</span>}
      </div>

      <div role="tablist" className="flex gap-1">
        {(["credits", "payouts", "licenses", "sales"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === t ? "bg-ink text-bg" : "text-muted hover:bg-sunk"}`}>
            {{ credits: "Royalty ledger", payouts: "PayPal payouts", licenses: "Licenses", sales: "Sales" }[t]} <span className="opacity-60">{data[t].length}</span>
          </button>
        ))}
      </div>
      <div style={rows.length > 12 ? { height: 560 } : undefined}>
        <AgGridReact theme={theme} domLayout={rows.length > 12 ? "normal" : "autoHeight"} rowData={rows} columnDefs={columns[tab]} defaultColDef={{ flex: 1, minWidth: 110, sortable: true, resizable: true, cellClass: "flex items-center" }} pagination paginationPageSize={20} overlayNoRowsTemplate="Nothing here yet. License a pattern on Snap &amp; license to see royalties appear." />
      </div>
    </div>
  );
}

function Kpi({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <div className="bg-surface p-4">
      <div className="font-mono text-[0.68rem] uppercase tracking-widest text-muted">{k}</div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${tone ?? ""}`}>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v)}</div>
    </div>
  );
}
