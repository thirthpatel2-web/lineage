// AG Studio data sources for Lineage: related tables for royalties, payouts, licenses, sales and
// the pattern lineage, plus the built-in "Royalties" report.

import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat, AgPageState, AgRelationDefinition, AgReportState, AgWidgetLayoutState } from "ag-studio";
import type { ConsoleData } from "@/lib/console-data";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] => specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }) }));
const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [st, sf] = source.split(".");
  const [tt, tf] = target.split(".");
  return { id, source: { tableId: st, fieldId: sf }, target: { tableId: tt, fieldId: tf }, type: "many-to-one" };
};
const CALENDAR = "calendar";

export function buildStudioData(data: ConsoleData): AgDataSourcesDefinition {
  const dates = [...data.credits, ...data.licenses, ...data.sales].map((r) => r.date?.slice(0, 10)).filter((d): d is string => !!d).sort();
  const today = data.asOf.slice(0, 10);
  return {
    description:
      "Lineage royalty data. Makers license craft patterns or sell finished items; each PayPal payment is split into credits for the pattern's designers (and the base pattern's designer when it is a remix), the maker, and a Lineage fee. Credits are paid out in PayPal Payouts batches. All money is USD.",
    sources: [
      {
        id: "credits",
        name: "Royalty Ledger",
        description: "One row per credit owed to a payee after a confirmed PayPal capture. Status: pending (next payout), in_batch, paid, unclaimed.",
        data: data.credits.filter((c) => c.payeeKind !== "platform"),
        fields: fields([
          ["id", "Credit ID", "textFormat", true],
          ["date", "Recorded", "dateTimeFormat"],
          ["payee", "Payee", "textFormat"],
          ["payeeKind", "Payee Role", "textFormat"],
          ["patternId", "Pattern ID", "textFormat", true],
          ["source", "Credit Source", "textFormat"],
          ["amount", "Credit Amount", "currencyFormat"],
          ["status", "Credit Status", "textFormat"],
          ["batch", "Payout Batch", "textFormat"],
        ]),
      },
      {
        id: "patterns",
        description: "Registered patterns. A remix has a parent pattern whose designer receives part of every royalty.",
        data: data.patterns,
        fields: fields([
          ["id", "Pattern ID", "textFormat", true],
          ["title", "Pattern", "textFormat"],
          ["designerId", "Designer ID", "textFormat", true],
          ["kind", "Original or Remix", "textFormat"],
          ["parentTitle", "Remix Of", "textFormat"],
          ["ratePercent", "Royalty %", "decimalFormat"],
          ["salesAllowed", "Sales Allowed", "booleanFormat"],
        ]),
      },
      {
        id: "designers",
        description: "Pattern designers, paid by PayPal email.",
        data: data.designers,
        fields: fields([
          ["id", "Designer ID", "textFormat", true],
          ["name", "Designer", "textFormat"],
          ["email", "Designer Email", "textFormat"],
        ]),
      },
      {
        id: "licenses",
        description: "Finished-item licenses bought by makers through PayPal Checkout.",
        data: data.licenses.filter((l) => l.status === "captured"),
        fields: fields([
          ["id", "License ID", "textFormat", true],
          ["date", "License Date", "dateTimeFormat"],
          ["patternId", "Licensed Pattern ID", "textFormat", true],
          ["maker", "Maker", "textFormat"],
          ["units", "Licensed Items", "integerFormat"],
          ["itemPrice", "Item Price", "currencyFormat"],
          ["amount", "License Paid", "currencyFormat"],
          ["source", "License Via", "textFormat"],
          ["status", "License Status", "textFormat"],
        ]),
      },
      {
        id: "sales",
        description: "Finished items sold on Lineage Market; each sale pays the maker and splits a royalty to the designers.",
        data: data.sales.filter((s) => s.status === "captured"),
        fields: fields([
          ["id", "Sale ID", "textFormat", true],
          ["date", "Sale Date", "dateTimeFormat"],
          ["item", "Item", "textFormat"],
          ["patternId", "Sold Pattern ID", "textFormat", true],
          ["amount", "Sale Amount", "currencyFormat"],
          ["source", "Bought Via", "textFormat"],
          ["status", "Sale Status", "textFormat"],
        ]),
      },
      {
        id: "payouts",
        description: "Items in PayPal Payouts batches, one per payee per batch.",
        data: data.payouts,
        fields: fields([
          ["id", "Payout Item ID", "textFormat", true],
          ["date", "Payout Date", "dateTimeFormat"],
          ["batch", "Batch", "textFormat"],
          ["payee", "Paid To", "textFormat"],
          ["payeeKind", "Paid Role", "textFormat"],
          ["amount", "Payout Amount", "currencyFormat"],
          ["status", "PayPal Status", "textFormat"],
        ]),
      },
    ],
    relationships: [
      manyToOne("credit-pattern", "credits.patternId", "patterns.id"),
      manyToOne("pattern-designer", "patterns.designerId", "designers.id"),
      manyToOne("license-pattern", "licenses.patternId", "patterns.id"),
      manyToOne("sale-pattern", "sales.patternId", "patterns.id"),
      { id: "credits-calendar", source: { tableId: "credits", fieldId: "date" }, target: { calendarId: CALENDAR }, truncate: "day" },
      { id: "licenses-calendar", source: { tableId: "licenses", fieldId: "date" }, target: { calendarId: CALENDAR }, truncate: "day" },
      { id: "payouts-calendar", source: { tableId: "payouts", fieldId: "date" }, target: { calendarId: CALENDAR }, truncate: "day" },
    ],
    calendars: [
      {
        id: CALENDAR,
        label: "Calendar",
        range: { from: { type: "date", value: dates[0] ?? today }, to: { type: "date", value: dates.at(-1) ?? today } },
        fragments: ["year", "month", "week", "day"],
      },
    ],
  };
}

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });
const kpi = (text: string, value: { id: string; aggregation?: "sum" | "countd" }) => ({
  type: "value" as const,
  dataMapping: { value: [value] },
  format: { title: { enabled: true, text } },
});

const royalties: AgPageState = {
  id: "royalties",
  widgets: {
    "kpi-designers": kpi("Royalties to designers", sum("credits.amount")),
    "kpi-licensed": kpi("Items licensed", sum("licenses.units")),
    "kpi-paid": kpi("Paid out by PayPal", sum("payouts.amount")),
    "kpi-patterns": kpi("Patterns earning", countd("credits.patternId")),
    "by-designer": {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [{ id: "credits.payee" }], valueKey: [sum("credits.amount")], legendKey: [{ id: "credits.status" }] },
      format: { ...title("Earnings by payee and payout status"), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    "by-pattern": {
      type: "donut-chart",
      dataMapping: { categoryKey: [{ id: "patterns.title" }], valueKey: [sum("credits.amount")] },
      format: title("Royalties by pattern"),
    },
    lineage: {
      type: "treemap-chart",
      dataMapping: { categoryKey: [{ id: "patterns.kind" }, { id: "patterns.title" }], valueKey: [sum("credits.amount")] },
      format: title("Originals vs remixes"),
    },
    ledger: {
      type: "grid",
      dataMapping: { cols: [{ id: "credits.date" }, { id: "credits.payee" }, { id: "credits.payeeKind" }, { id: "patterns.title" }, { id: "credits.status" }, { id: "credits.batch" }, sum("credits.amount")] },
      sort: [{ field: { id: "credits.date" }, direction: "desc" }],
      format: title("Royalty ledger"),
    },
  },
  widgetLayout: {
    "kpi-designers": at(0, 0, 6, 7),
    "kpi-licensed": at(6, 0, 6, 7),
    "kpi-paid": at(12, 0, 6, 7),
    "kpi-patterns": at(18, 0, 6, 7),
    "by-designer": at(0, 7, 14, 18),
    "by-pattern": at(14, 7, 10, 18),
    lineage: at(0, 25, 10, 18),
    ledger: at(10, 25, 14, 18),
  },
};

export const initialReport: AgReportState = { pages: [royalties], selectedPageId: "royalties" };
