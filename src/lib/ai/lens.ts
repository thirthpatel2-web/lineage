// Lineage Lens: which registered pattern was this finished item made from?
//   1. Recall  - CLIP embedding similarity against every registered pattern photo (local, fast).
//   2. Verify  - Claude compares the photo with the top candidates' reference photos on
//                construction features and explains its reasoning (when ANTHROPIC_API_KEY is set).
//   3. Band    - plain code turns the score into strong / possible / none. A traditional design
//                that nobody owns is never matched, whatever its score.

import { z } from "zod";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { MatchCandidate } from "@/lib/db/schema";
import { mode } from "@/lib/env";
import { cosine } from "./embed";
import { imageBlock, structured } from "./claude";

export const BANDS = { strong: 0.85, possible: 0.6 } as const;
const RECALL_K = 4;
const REFS_PER_PATTERN = 2;

// Embedding-only fallback: map cosine similarity onto a 0-1 score. Calibrated by `npm run eval`.
const EMBED_FLOOR = 0.8;
const EMBED_CEIL = 0.93;
export const embeddingScore = (sim: number) => Math.min(1, Math.max(0, (sim - EMBED_FLOOR) / (EMBED_CEIL - EMBED_FLOOR)));

export type LensResult = {
  band: "strong" | "possible" | "none" | "traditional";
  candidates: MatchCandidate[];
  traditionalReason: string | null;
  verifiedBy: "vision" | "embedding";
};

export function bandFor(score: number): "strong" | "possible" | "none" {
  if (score >= BANDS.strong) return "strong";
  if (score >= BANDS.possible) return "possible";
  return "none";
}

const Verdict = z.object({
  traditional: z.object({
    is_traditional: z.boolean().describe("True only if the photographed item is a generic traditional form nobody can own (granny square, plain beanie, simple ball, basic scarf) rather than a distinctive design."),
    reason: z.string().describe("One short sentence."),
  }),
  candidates: z.array(
    z.object({
      id: z.string().describe("The candidate's pattern id exactly as given."),
      score: z.number().describe("0 to 1: how confident you are the item was made from THIS pattern specifically (not just the same kind of object)."),
      features: z
        .array(z.object({ name: z.string(), score: z.number() }))
        .describe("3 or 4 construction features you compared, each scored 0 to 1."),
      explanation: z.string().describe("One or two plain sentences a maker can understand, naming the decisive differences or similarities."),
    }),
  ),
});

const SYSTEM = `You are Lineage Lens, the matching step of a royalty service for handmade goods.
A maker photographed a finished item (crochet, knitting, sewing or 3D print). You see that photo first, then reference photos of candidate patterns.
Decide how likely it is that the item was made from each candidate pattern.

Judge construction, not just subject: silhouette and proportions, how parts are shaped and attached (ears, limbs, accessories), stitch type and texture, colour-change placement, and distinctive details. Colour alone is weak evidence because makers choose their own yarn.
A remix adds or changes distinctive parts on top of a base pattern. If the photo shows the remix's added parts (for example a helmet), the remix scores higher than its base; if it lacks them, the base scores higher.
Different designers' patterns of the same animal are NOT matches unless the construction details agree.
Be calibrated: 0.9+ only when several specific details agree, below 0.5 when it is merely the same kind of object.`;

type Candidate = { patternId: string; title: string; designer: string; recall: number; refs: { id: string; bytes: Buffer }[] };

export async function runLens(query: { bytes: Buffer; embedding: number[] }): Promise<LensResult> {
  const db = await getDb();
  const rows = await db
    .select({
      imageId: schema.images.id,
      patternId: schema.images.patternId,
      embedding: schema.images.embedding,
      title: schema.patterns.title,
      designer: schema.designers.name,
    })
    .from(schema.images)
    .innerJoin(schema.patterns, eq(schema.patterns.id, schema.images.patternId))
    .innerJoin(schema.designers, eq(schema.designers.id, schema.patterns.designerId))
    .where(and(eq(schema.images.kind, "pattern"), isNotNull(schema.images.embedding)));

  // Best-matching reference photo per pattern.
  const byPattern = new Map<string, Candidate & { ranked: { id: string; sim: number }[] }>();
  for (const row of rows) {
    const sim = cosine(query.embedding, row.embedding!);
    const entry = byPattern.get(row.patternId!) ?? { patternId: row.patternId!, title: row.title, designer: row.designer, recall: -1, refs: [], ranked: [] };
    entry.recall = Math.max(entry.recall, sim);
    entry.ranked.push({ id: row.imageId, sim });
    byPattern.set(row.patternId!, entry);
  }
  const top = [...byPattern.values()].sort((a, b) => b.recall - a.recall).slice(0, RECALL_K);
  if (top.length === 0) return { band: "none", candidates: [], traditionalReason: null, verifiedBy: "embedding" };

  if (!mode.ai) {
    const candidates = top.map((c) => ({
      patternId: c.patternId,
      title: c.title,
      designer: c.designer,
      recall: c.recall,
      score: embeddingScore(c.recall),
      features: [{ name: "Overall visual similarity", score: embeddingScore(c.recall) }],
      explanation: "Matched on overall visual similarity only. Add a free Gemini API key to compare construction details.",
    }));
    return { band: bandFor(candidates[0].score), candidates, traditionalReason: null, verifiedBy: "embedding" };
  }

  // Load the closest reference photos for each candidate.
  const refIds = top.flatMap((c) => c.ranked.sort((a, b) => b.sim - a.sim).slice(0, REFS_PER_PATTERN).map((r) => r.id));
  const refRows = await db.select({ id: schema.images.id, patternId: schema.images.patternId, bytes: schema.images.bytes }).from(schema.images).where(inArray(schema.images.id, refIds));
  for (const c of top) c.refs = refRows.filter((r) => r.patternId === c.patternId).map((r) => ({ id: r.id, bytes: r.bytes }));

  const verdict = await structured(Verdict, {
    system: SYSTEM,
    effort: "medium",
    content: [
      { type: "text", text: "PHOTO OF THE FINISHED ITEM:" },
      imageBlock(query.bytes),
      ...top.flatMap((c) => [
        { type: "text" as const, text: `CANDIDATE id="${c.patternId}" - "${c.title}" by ${c.designer}. Reference photos:` },
        ...c.refs.map((r) => imageBlock(r.bytes)),
      ]),
      { type: "text", text: `Score every candidate (${top.map((c) => c.patternId).join(", ")}) and decide whether the item is a traditional design.` },
    ],
  });

  const candidates = top
    .map((c) => {
      const v = verdict.candidates.find((x) => x.id === c.patternId);
      const score = clamp01(v?.score ?? 0);
      return {
        patternId: c.patternId,
        title: c.title,
        designer: c.designer,
        recall: c.recall,
        score,
        features: (v?.features ?? []).map((f) => ({ name: f.name, score: clamp01(f.score) })),
        explanation: v?.explanation ?? "Not assessed.",
      };
    })
    .sort((a, b) => b.score - a.score);

  if (verdict.traditional.is_traditional) {
    return { band: "traditional", candidates, traditionalReason: verdict.traditional.reason, verifiedBy: "vision" };
  }
  return { band: bandFor(candidates[0].score), candidates, traditionalReason: null, verifiedBy: "vision" };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
