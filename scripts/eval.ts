// Accuracy report for Lineage Lens.
//   npm run eval                 -> 20 photos per design (160 total)
//   npm run eval -- --per 5      -> quicker run
//   npm run eval -- --photos dir -> real photos: dir/<pattern-id>/*.jpg, unknown items in dir/_none/
//
// For every test photo it runs the same matcher the app uses and records whether the top match is
// the right pattern (top-1), whether the right pattern is in the shortlist (top-3), and whether an
// unregistered item was wrongly matched with confidence (false match). Writes eval/report.json,
// which the /eval page shows.

import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { renderJpeg, type DesignKey } from "@/lib/demo-art";
import { mode } from "@/lib/env";
import { prepareImage } from "@/lib/images";
import { runLens } from "@/lib/ai/lens";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const PER = Number(flag("per") ?? 20);
const PHOTOS = flag("photos");

// Registered designs map to their pattern; the rest are items nobody registered.
const SYNTHETIC: { design: DesignKey; expected: string | null; traditional?: boolean }[] = [
  { design: "clover-bunny", expected: "pat_clover_bunny" },
  { design: "astronaut-bunny", expected: "pat_astro_bunny" },
  { design: "lighthouse-octopus", expected: "pat_lighthouse_octopus" },
  { design: "sleepy-whale", expected: "pat_sleepy_whale" },
  { design: "fern-frog", expected: "pat_fern_frog" },
  { design: "granny-square", expected: null, traditional: true },
  { design: "plain-beanie", expected: null, traditional: true },
  { design: "tabby-cat", expected: null },
];

type Case = { label: string; expected: string | null; load: () => Promise<Buffer> };

function cases(): Case[] {
  if (PHOTOS) {
    return fs.readdirSync(PHOTOS).flatMap((dir) =>
      fs
        .readdirSync(path.join(PHOTOS, dir))
        .filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f))
        .map((f) => ({ label: `${dir}/${f}`, expected: dir === "_none" ? null : dir, load: async () => fs.readFileSync(path.join(PHOTOS, dir, f)) })),
    );
  }
  return SYNTHETIC.flatMap((s, d) =>
    Array.from({ length: PER }, (_, i) => ({ label: `${s.design}#${i}`, expected: s.expected, load: () => renderJpeg(s.design, 1000 + d * 1000 + i) })),
  );
}

async function main() {
  await getDb();
  const all = cases();
  const rows: { label: string; expected: string | null; top: string | null; score: number; recall: number; band: string; inTop3: boolean }[] = [];
  let i = 0;
  for (const c of all) {
    const image = await prepareImage(await c.load());
    const result = await runLens(image);
    const top = result.candidates[0];
    rows.push({
      label: c.label,
      expected: c.expected,
      top: top?.patternId ?? null,
      score: top?.score ?? 0,
      recall: top?.recall ?? 0,
      band: result.band,
      inTop3: c.expected ? result.candidates.slice(0, 3).some((x) => x.patternId === c.expected) : false,
    });
    if (++i % 10 === 0) process.stdout.write(`  ${i}/${all.length}\n`);
  }

  const positives = rows.filter((r) => r.expected);
  const negatives = rows.filter((r) => !r.expected);
  const confident = (r: (typeof rows)[number]) => r.band === "strong" || r.band === "possible";
  const report = {
    generatedAt: new Date().toISOString(),
    method: mode.ai ? "vision" : "embedding",
    dataset: PHOTOS ? "photos" : "illustrations",
    photos: rows.length,
    positives: positives.length,
    negatives: negatives.length,
    top1: ratio(positives.filter((r) => r.top === r.expected).length, positives.length),
    top3: ratio(positives.filter((r) => r.inTop3).length, positives.length),
    // A registered item matched confidently to the WRONG pattern, or an unregistered item matched at all.
    falseMatch: ratio(
      positives.filter((r) => confident(r) && r.top !== r.expected).length + negatives.filter(confident).length,
      rows.length,
    ),
    strongAndRight: ratio(positives.filter((r) => r.band === "strong" && r.top === r.expected).length, positives.length),
    negativesRejected: ratio(negatives.filter((r) => !confident(r)).length, negatives.length),
    recallStats: {
      positiveTop: stats(positives.filter((r) => r.top === r.expected).map((r) => r.recall)),
      negativeTop: stats(negatives.map((r) => r.recall)),
    },
    confusion: confusion(positives),
    rows,
  };

  fs.mkdirSync("eval", { recursive: true });
  fs.writeFileSync("eval/report.json", JSON.stringify(report, null, 2));
  console.log(`\nLineage Lens (${report.method}, ${report.dataset}), ${report.photos} photos`);
  console.log(`  top-1 accuracy      ${pct(report.top1)}`);
  console.log(`  top-3 accuracy      ${pct(report.top3)}`);
  console.log(`  false-match rate    ${pct(report.falseMatch)}`);
  console.log(`  unknowns rejected   ${pct(report.negativesRejected)}`);
  console.log(`  recall (right)      ${JSON.stringify(report.recallStats.positiveTop)}`);
  console.log(`  recall (unknown)    ${JSON.stringify(report.recallStats.negativeTop)}`);
  process.exit(0);
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
function stats(xs: number[]) {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (p: number) => Number(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(3));
  return { min: q(0), p10: q(0.1), median: q(0.5), p90: q(0.9), max: q(0.999) };
}
function confusion(rows: { expected: string | null; top: string | null }[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const e = r.expected ?? "none";
    out[e] ??= {};
    out[e][r.top ?? "none"] = (out[e][r.top ?? "none"] ?? 0) + 1;
  }
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
