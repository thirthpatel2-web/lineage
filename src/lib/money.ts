// All money is integer cents. Shares are basis points (10000 = 100%). Every split sums exactly
// to its input; rounding leftovers go to the base designer at the root of the lineage.

export type ChainLink = {
  patternId: string;
  designerId: string;
  // Share of this pattern's royalty that flows up to its parent. Ignored on the root.
  parentShareBp: number;
};

export type Credit = {
  payeeKind: "designer" | "maker" | "platform";
  payeeId: string;
  patternId: string | null;
  amountCents: number;
};

export const PLATFORM_ID = "lineage";

export function assertCents(value: number, label = "amount") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
}

/** Royalty owed for one finished item: the license rate of the price, never below the minimum. */
export function royaltyPerItem(itemPriceCents: number, rateBp: number, minCents: number) {
  assertCents(itemPriceCents, "itemPriceCents");
  return Math.max(Math.round((itemPriceCents * rateBp) / 10000), minCents);
}

export function licenseAmount(itemPriceCents: number, rateBp: number, minCents: number, units: number) {
  if (!Number.isInteger(units) || units < 1) throw new Error("units must be a positive integer");
  return royaltyPerItem(itemPriceCents, rateBp, minCents) * units;
}

/**
 * Split a royalty between the platform fee and every designer in the lineage.
 * `chain` runs from the matched pattern (index 0) up to the base pattern (last).
 */
export function splitRoyalty(totalCents: number, chain: ChainLink[], feeBp: number): Credit[] {
  assertCents(totalCents, "totalCents");
  if (chain.length === 0) throw new Error("chain must contain at least the matched pattern");
  if (feeBp < 0 || feeBp > 10000) throw new Error("feeBp must be between 0 and 10000");

  const fee = Math.round((totalCents * feeBp) / 10000);
  let remaining = totalCents - fee;
  const credits: Credit[] = [];

  chain.forEach((link, index) => {
    const isRoot = index === chain.length - 1;
    const share = Math.min(Math.max(link.parentShareBp, 0), 10000);
    const amount = isRoot ? remaining : Math.floor((remaining * (10000 - share)) / 10000);
    remaining -= amount;
    credits.push({ payeeKind: "designer", payeeId: link.designerId, patternId: link.patternId, amountCents: amount });
  });

  if (fee > 0) credits.push({ payeeKind: "platform", payeeId: PLATFORM_ID, patternId: null, amountCents: fee });
  return mergeCredits(credits);
}

/** A sale of a finished item: the maker keeps the price minus the royalty, which is split up the lineage. */
export function splitSale(priceCents: number, rateBp: number, minCents: number, makerId: string, chain: ChainLink[], feeBp: number) {
  const royalty = Math.min(royaltyPerItem(priceCents, rateBp, minCents), priceCents);
  const maker: Credit = { payeeKind: "maker", payeeId: makerId, patternId: null, amountCents: priceCents - royalty };
  return { royalty, credits: [maker, ...splitRoyalty(royalty, chain, feeBp)].filter((c) => c.amountCents > 0) };
}

// One designer can own several patterns in a chain; pay them once per pattern, but drop empty rows.
function mergeCredits(credits: Credit[]) {
  const merged = new Map<string, Credit>();
  for (const credit of credits) {
    const key = `${credit.payeeKind}:${credit.payeeId}:${credit.patternId ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.amountCents += credit.amountCents;
    else merged.set(key, { ...credit });
  }
  return [...merged.values()].filter((c) => c.amountCents > 0);
}

export const sum = (credits: { amountCents: number }[]) => credits.reduce((total, c) => total + c.amountCents, 0);

export const formatCents = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** PayPal amounts are decimal strings. */
export const toPayPalValue = (cents: number) => (cents / 100).toFixed(2);

export function fromPayPalValue(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`Unexpected PayPal amount: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
