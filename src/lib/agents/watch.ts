// The designer-side watch agent: given a listing a designer found, confirm it was made from their
// pattern, then draft a friendly license offer. A person approves before the PayPal invoice is sent.

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { mode } from "@/lib/env";
import { structured } from "@/lib/ai/claude";
import { runLens } from "@/lib/ai/lens";
import { storeImage } from "@/lib/images";
import { getChain } from "@/lib/lineage";
import { formatCents, licenseAmount, royaltyPerItem } from "@/lib/money";
import { createAndSendInvoice } from "@/lib/paypal";

const Draft = z.object({
  subject: z.string(),
  message: z.string().describe("The full message, 90 to 160 words."),
});

export async function draftOffer(input: {
  patternId: string;
  photo: Buffer;
  listingUrl?: string;
  sellerName: string;
  sellerEmail: string;
  units: number;
  itemPriceCents: number;
}) {
  const chain = await getChain(input.patternId);
  const pattern = chain[0];
  const image = await storeImage(input.photo, "offer");
  const lens = await runLens(image);
  const hit = lens.candidates.find((c) => c.patternId === pattern.id);
  const score = hit?.score ?? 0;

  if (lens.band === "traditional") {
    return { ok: false as const, reason: `This looks like a traditional design (${lens.traditionalReason}). Nobody can license it, so no offer was drafted.` };
  }
  if (score < 0.6) {
    const top = lens.candidates[0];
    return {
      ok: false as const,
      reason: `Lineage is not confident this was made from "${pattern.title}" (score ${score.toFixed(2)}).${top && top.patternId !== pattern.id ? ` It looks closer to "${top.title}" by ${top.designer}.` : ""} No offer was drafted, to avoid accusing an honest maker.`,
    };
  }

  const amountCents = licenseAmount(input.itemPriceCents, pattern.rateBp, pattern.minCents, input.units);
  const perItem = royaltyPerItem(input.itemPriceCents, pattern.rateBp, pattern.minCents);
  const credits = chain.map((p) => p.designer.name).join(" and ");
  const message = mode.ai
    ? (
        await structured(Draft, {
          system:
            "You write license offers from a craft pattern designer to a maker who sells items made from their pattern without a license. Warm, short, never threatening or legalistic. Assume good faith: many makers don't know who designed a pattern. Make clear paying is a simple way to sell with the designer's blessing, and that no takedown is being requested. Plain text, no markdown.",
          effort: "low",
          maxTokens: 2000,
          content: [
            {
              type: "text",
              text: `Designer(s) to credit: ${credits}. Pattern: "${pattern.title}". Seller: ${input.sellerName}. Listing: ${input.listingUrl ?? "a listing they found"}.
Offer: license ${input.units} items at ${formatCents(perItem)} each (${pattern.rateBp / 100}% of ${formatCents(input.itemPriceCents)}), total ${formatCents(amountCents)}, payable by the attached PayPal invoice.
Why we think it matches: ${hit?.explanation ?? ""}`,
            },
          ],
        })
      ).message
    : `Hi ${input.sellerName},\n\nYour listing looks like it was made from "${pattern.title}" by ${credits}. Lovely work! Rather than asking for a takedown, ${pattern.designer.name} would like to offer you a simple license: ${input.units} items at ${formatCents(perItem)} each, ${formatCents(amountCents)} in total, payable through the PayPal invoice attached. Once paid, you can keep selling with the designer's blessing and a credit on your tag.\n\nThank you for making with this pattern.`;

  const db = await getDb();
  const id = `off_${nanoid(10)}`;
  await db.insert(schema.offers).values({
    id,
    patternId: pattern.id,
    listingUrl: input.listingUrl ?? null,
    sellerName: input.sellerName,
    sellerEmail: input.sellerEmail.toLowerCase(),
    imageId: image.id,
    matchScore: score,
    units: input.units,
    amountCents,
    message,
  });
  return { ok: true as const, id, score, amountCents, message, explanation: hit?.explanation };
}

export async function sendOffer(offerId: string) {
  const db = await getDb();
  const offer = await db.query.offers.findFirst({ where: eq(schema.offers.id, offerId) });
  if (!offer) throw new Error("Offer not found");
  if (offer.status !== "draft") return offer;
  const pattern = (await getChain(offer.patternId))[0];
  const invoice = await createAndSendInvoice({
    recipientEmail: offer.sellerEmail,
    recipientName: offer.sellerName,
    itemName: `Finished-item license: ${pattern.title}`,
    itemDescription: `License to sell ${offer.units} finished items made from "${pattern.title}" by ${pattern.designer.name}, via Lineage.`,
    units: offer.units,
    unitCents: Math.round(offer.amountCents / offer.units),
    note: offer.message,
    reference: offer.id,
  });
  const [updated] = await db
    .update(schema.offers)
    .set({ status: "sent", invoiceId: invoice.id, invoiceUrl: invoice.payerUrl })
    .where(eq(schema.offers.id, offer.id))
    .returning();
  return updated;
}
