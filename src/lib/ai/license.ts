// Turns a designer's free-text terms ("you may sell finished items, credit me, small batches")
// into structured license terms the designer then confirms.
import { z } from "zod";
import { mode } from "@/lib/env";
import { structured } from "./claude";

export const LicenseTerms = z.object({
  sales_allowed: z.boolean().describe("May makers sell finished items made from this pattern?"),
  credit_required: z.boolean().describe("Must sellers credit the designer?"),
  batch_limit: z.number().int().nullable().describe("Maximum items a maker may sell, or null if unlimited."),
  suggested_rate_percent: z.number().describe("A fair royalty as a percent of each item's price. Use the designer's number if stated, otherwise 8."),
  summary: z.string().describe("The terms in one plain sentence a maker understands."),
  notes: z.array(z.string()).describe("Anything ambiguous the designer should double-check. Empty if clear."),
});
export type LicenseTerms = z.infer<typeof LicenseTerms>;

export async function readLicense(text: string): Promise<LicenseTerms & { source: "ai" | "default" }> {
  const trimmed = text.trim();
  if (!mode.ai || !trimmed) {
    return {
      sales_allowed: !/no (finished|commercial)|not (be )?sold|personal use only/i.test(trimmed),
      credit_required: /credit|attribut/i.test(trimmed) || !trimmed,
      batch_limit: null,
      suggested_rate_percent: 8,
      summary: trimmed ? "Read without AI. Please check the terms below." : "Makers may sell finished items with credit, for an 8% royalty.",
      notes: mode.ai ? [] : ["AI license reading is off (no ANTHROPIC_API_KEY), so these are defaults."],
      source: "default",
    };
  }
  const terms = await structured(LicenseTerms, {
    system:
      "You read the terms a craft pattern designer wrote about selling finished items made from their pattern. Extract them faithfully. Never invent permissions the text does not give; if the text forbids sales, sales_allowed is false.",
    effort: "low",
    maxTokens: 4000,
    content: [{ type: "text", text: `Designer's terms:\n"""\n${trimmed.slice(0, 6000)}\n"""` }],
  });
  return { ...terms, source: "ai" };
}
