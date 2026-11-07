// The tools Lineage gives AI agents. The same functions back the public MCP server (/mcp) and the
// in-app shopping agent. Agents can look things up and prepare payments, but every PayPal charge
// needs a person to approve it at the returned link.

import { and, eq, gt, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { runLens, type LensResult } from "@/lib/ai/lens";
import { renderJpeg, type DesignKey, DESIGNS } from "@/lib/demo-art";
import { prepareImage } from "@/lib/images";
import { getChain, toLinks } from "@/lib/lineage";
import { formatCents, licenseAmount, splitRoyalty } from "@/lib/money";
import { startLicenseCheckout, startSaleCheckout } from "@/lib/commerce";
import { fetchPublicImage } from "@/lib/safe-fetch";

// --- Fetching images safely ---------------------------------------------------------

async function loadImage(url: string): Promise<Buffer> {
  // Our own images and demo art are read directly, never over HTTP.
  const local = url.startsWith(env.appUrl) ? url.slice(env.appUrl.length) : url.startsWith("/") ? url : null;
  if (local) {
    const img = local.match(/^\/api\/images\/(img_[\w-]+)/);
    if (img) {
      const db = await getDb();
      const row = await db.query.images.findFirst({ where: eq(schema.images.id, img[1]) });
      if (!row) throw new Error("Image not found");
      return row.bytes;
    }
    const art = local.match(/^\/api\/demo-art\/([\w-]+)\/(\d+)/);
    if (art && art[1] in DESIGNS) return renderJpeg(art[1] as DesignKey, Number(art[2]));
    throw new Error("Unsupported local image URL");
  }
  return fetchPublicImage(url);
}

// --- Shared summaries ---------------------------------------------------------------

async function describeLineage(patternId: string) {
  const chain = await getChain(patternId);
  return chain.map((p, i) => ({
    pattern_id: p.id,
    title: p.title,
    designer: p.designer.name,
    role: i === 0 ? (chain.length > 1 ? "remix" : "original") : i === chain.length - 1 ? "base pattern" : "ancestor",
    share_of_royalty_to_parent: i < chain.length - 1 ? `${p.parentShareBp / 100}%` : undefined,
  }));
}

function provenanceSummary(result: LensResult) {
  const top = result.candidates[0];
  return {
    match: result.band,
    confidence: top ? Number(top.score.toFixed(2)) : 0,
    matched_pattern_id: result.band === "strong" || result.band === "possible" ? top?.patternId : null,
    explanation:
      result.band === "traditional"
        ? `Traditional design: ${result.traditionalReason ?? "no one owns it"}. No license needed.`
        : result.band === "none"
          ? "No registered pattern matches this item."
          : top?.explanation,
    verified_by: result.verifiedBy,
  };
}

// --- Tool definitions ---------------------------------------------------------------

export const checkProvenanceInput = z.object({
  image_url: z.string().optional().describe("https URL of a photo of the item"),
  listing_id: z.string().optional().describe("A Lineage Market listing id (lst_...)"),
});

export async function checkProvenance(input: z.infer<typeof checkProvenanceInput>) {
  const db = await getDb();
  if (input.listing_id) {
    const listing = await db.query.listings.findFirst({ where: eq(schema.listings.id, input.listing_id) });
    if (!listing) throw new Error("Unknown listing");
    return {
      licensed: true,
      how: "Sold through Lineage Checkout, which pays the designers' royalty on every sale.",
      lineage: await describeLineage(listing.patternId),
      lineage_json: `${env.appUrl}/patterns/${listing.patternId}/lineage.json`,
    };
  }
  if (!input.image_url) throw new Error("Give image_url or listing_id");
  const image = await prepareImage(await loadImage(input.image_url));
  const result = await runLens(image);
  const summary = provenanceSummary(result);
  if (!summary.matched_pattern_id) return { licensed: null, ...summary };
  const pattern = (await getChain(summary.matched_pattern_id))[0];
  return {
    // Items outside Lineage carry no license record, so a confident match means an unlicensed copy.
    licensed: false,
    ...summary,
    designer_allows_sales: pattern.salesAllowed,
    lineage: await describeLineage(pattern.id),
    advice: pattern.salesAllowed
      ? `This looks like "${pattern.title}" by ${pattern.designer.name}, sold without a license. Prefer a licensed listing on Lineage Market.`
      : `This copies "${pattern.title}", whose designer does not allow selling finished items. Do not buy it.`,
    lineage_json: `${env.appUrl}/patterns/${pattern.id}/lineage.json`,
  };
}

export const licenseTermsInput = z.object({ pattern_id: z.string() });

export async function getLicenseTerms({ pattern_id }: z.infer<typeof licenseTermsInput>) {
  const chain = await getChain(pattern_id);
  const p = chain[0];
  return {
    pattern_id: p.id,
    title: p.title,
    designer: p.designer.name,
    sales_allowed: p.salesAllowed,
    credit_required: p.creditRequired,
    royalty_percent: p.rateBp / 100,
    minimum_per_item: formatCents(p.minCents),
    batch_limit: p.batchLimit,
    designer_terms: p.licenseText,
    lineage: await describeLineage(p.id),
  };
}

export const quoteLicenseInput = z.object({
  pattern_id: z.string(),
  units: z.number().int().min(1).max(500),
  item_price_usd: z.number().positive().describe("Price each finished item sells for, in USD"),
});

export async function quoteLicense(input: z.infer<typeof quoteLicenseInput>) {
  const chain = await getChain(input.pattern_id);
  const p = chain[0];
  if (!p.salesAllowed) return { allowed: false, reason: `${p.designer.name} does not allow selling finished items from this pattern.` };
  if (p.batchLimit && input.units > p.batchLimit) return { allowed: false, reason: `${p.designer.name} allows at most ${p.batchLimit} items per license.` };
  const amount = licenseAmount(Math.round(input.item_price_usd * 100), p.rateBp, p.minCents, input.units);
  const split = splitRoyalty(amount, toLinks(chain), env.platformFeeBp);
  return {
    allowed: true,
    total: formatCents(amount),
    split: split.map((c) => ({
      to: c.payeeKind === "platform" ? "Lineage fee" : chain.find((x) => x.designerId === c.payeeId)?.designer.name,
      amount: formatCents(c.amountCents),
    })),
  };
}

export const buyLicenseInput = quoteLicenseInput.extend({ maker_id: z.string().describe("The maker's Lineage id (mkr_...)") });

export async function buyLicense(input: z.infer<typeof buyLicenseInput>) {
  const checkout = await startLicenseCheckout({
    patternId: input.pattern_id,
    makerId: input.maker_id,
    units: input.units,
    itemPriceCents: Math.round(input.item_price_usd * 100),
    source: "agent",
  });
  return {
    status: "awaiting_approval",
    amount: formatCents(checkout.amountCents),
    approve_url: checkout.approveUrl,
    note: "Give this PayPal link to the person. Nothing is charged until they approve it.",
  };
}

export const findItemsInput = z.object({
  query: z.string().describe("What to look for, e.g. 'astronaut bunny'"),
  max_price_usd: z.number().positive().optional(),
  include_outside: z.boolean().default(true).describe("Also search other marketplaces (their provenance is unverified)"),
});

export async function findLicensedItems(input: z.infer<typeof findItemsInput>) {
  const db = await getDb();
  const words = input.query.split(/\s+/).filter((w) => w.length > 2);
  const text = words.length
    ? or(...words.flatMap((w) => [ilike(schema.listings.title, `%${w}%`), ilike(schema.patterns.title, `%${w}%`)]))
    : undefined;
  const rows = await db
    .select({ listing: schema.listings, pattern: schema.patterns, designer: schema.designers, maker: schema.makers })
    .from(schema.listings)
    .innerJoin(schema.patterns, eq(schema.patterns.id, schema.listings.patternId))
    .innerJoin(schema.designers, eq(schema.designers.id, schema.patterns.designerId))
    .innerJoin(schema.makers, eq(schema.makers.id, schema.listings.makerId))
    .where(and(gt(schema.listings.stock, 0), text, input.max_price_usd ? lte(schema.listings.priceCents, Math.round(input.max_price_usd * 100)) : undefined))
    .limit(10);

  const relevance = (r: (typeof rows)[number]) => words.filter((w) => `${r.listing.title} ${r.pattern.title}`.toLowerCase().includes(w.toLowerCase())).length;
  const lineageListings = [...rows].sort((a, b) => relevance(b) - relevance(a)).map((r) => ({
    listing_id: r.listing.id,
    title: r.listing.title,
    price: formatCents(r.listing.priceCents),
    maker: r.maker.shopName,
    pattern: `${r.pattern.title} by ${r.designer.name}`,
    image_url: `${env.appUrl}/api/images/${r.listing.imageId}`,
    provenance: "licensed (royalty paid at checkout)",
  }));
  const outside = input.include_outside ? await searchOutside(input.query, input.max_price_usd) : [];
  return {
    lineage_market: lineageListings,
    other_marketplaces: outside,
    note: outside.length ? "Run check_provenance on outside items before recommending them." : undefined,
  };
}

// Outside listings: Channel3 when a key is set, otherwise a small labelled sample so the
// shopping-agent demo runs offline.
async function searchOutside(query: string, maxPrice?: number) {
  if (env.channel3Key) {
    try {
      const res = await fetch("https://api.trychannel3.com/v1/search", {
        method: "POST",
        headers: { "x-api-key": env.channel3Key, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `handmade crochet ${query}`, limit: 5, ...(maxPrice && { filters: { price: { max_price: maxPrice } } }) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { products?: Channel3Product[] };
        return (json.products ?? []).slice(0, 5).map((p) => {
          const offer = p.offers?.[0];
          return {
            source: `Channel3 · ${offer?.domain ?? "retailer"}`,
            title: p.title,
            price: offer?.price ? `${offer.price.price} ${offer.price.currency}` : "unknown",
            image_url: p.images?.[0]?.url,
            url: offer?.url,
            provenance: "unverified",
          };
        });
      }
    } catch {
      // fall through to the sample
    }
  }
  return SAMPLE_OUTSIDE.filter((s) => (!maxPrice || s.priceCents <= maxPrice * 100) && overlaps(query, s.title)).map((s) => ({
    source: "Sample outside marketplace (demo data)",
    title: s.title,
    price: formatCents(s.priceCents),
    image_url: `${env.appUrl}/api/demo-art/${s.design}/${s.seed}`,
    url: s.url,
    provenance: "unverified",
  }));
}

type Channel3Product = {
  title: string;
  images?: { url: string }[];
  offers?: { url?: string; domain?: string; price?: { price: number; currency: string } }[];
};

const SAMPLE_OUTSIDE = [
  { title: "Space bunny plush, handmade crochet", priceCents: 2600, design: "astronaut-bunny", seed: 4242, url: "https://example.com/quickcraftz/space-bunny" },
  { title: "Crochet bunny with clover", priceCents: 2200, design: "clover-bunny", seed: 5151, url: "https://example.com/yarnbarn/bunny" },
  { title: "Chunky crochet frog with leaf hat", priceCents: 2400, design: "fern-frog", seed: 6161, url: "https://example.com/pondstore/frog" },
  { title: "Handmade crochet tabby cat", priceCents: 2800, design: "tabby-cat", seed: 7171, url: "https://example.com/catcraft/tabby" },
];

const overlaps = (query: string, title: string) => {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return words.length === 0 || words.some((w) => title.toLowerCase().includes(w.replace(/s$/, "")));
};

export const buyItemInput = z.object({
  listing_id: z.string().describe("A Lineage Market listing id (lst_...)"),
  note: z.string().optional().describe("Gift note or instructions for the maker"),
});

export async function buyItem(input: z.infer<typeof buyItemInput>) {
  const checkout = await startSaleCheckout({ listingId: input.listing_id, source: "agent", note: input.note });
  return {
    status: "awaiting_approval",
    amount: formatCents(checkout.amountCents),
    approve_url: checkout.approveUrl,
    note: "Give this PayPal link to the person. The designer's royalty is split out automatically when they pay.",
  };
}

export const TOOLS = [
  {
    name: "find_licensed_items",
    description: "Search handmade items. Lineage Market items are licensed; items from other marketplaces have unverified provenance and should be checked with check_provenance.",
    input: findItemsInput,
    run: findLicensedItems,
  },
  {
    name: "check_provenance",
    description: "Identify which registered pattern a handmade item was made from, its full remix lineage, and whether it is licensed. Pass a photo URL or a Lineage listing id.",
    input: checkProvenanceInput,
    run: checkProvenance,
  },
  {
    name: "get_license_terms",
    description: "The designer's terms for selling finished items made from a pattern.",
    input: licenseTermsInput,
    run: getLicenseTerms,
  },
  {
    name: "quote_license",
    description: "Price a license to sell finished items from a pattern, and show how the royalty splits between designers.",
    input: quoteLicenseInput,
    run: quoteLicense,
  },
  {
    name: "buy_license",
    description: "Prepare a PayPal checkout for a maker to license a pattern. Returns a link the person must approve; nothing is charged until they do.",
    input: buyLicenseInput,
    run: buyLicense,
  },
  {
    name: "buy_item",
    description: "Prepare a PayPal checkout for a licensed Lineage Market item. Returns a link the person must approve; the designer royalty is split out automatically.",
    input: buyItemInput,
    run: buyItem,
  },
] as const;
