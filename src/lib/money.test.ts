import { describe, expect, it } from "vitest";
import { fromPayPalValue, licenseAmount, royaltyPerItem, splitRoyalty, splitSale, sum, toPayPalValue, type ChainLink } from "./money";

const jun: ChainLink = { patternId: "astro", designerId: "jun", parentShareBp: 3000 };
const maya: ChainLink = { patternId: "clover", designerId: "maya", parentShareBp: 0 };

describe("royalties", () => {
  it("charges the rate of the item price, with a floor", () => {
    expect(royaltyPerItem(4000, 800, 100)).toBe(320);
    expect(royaltyPerItem(500, 800, 100)).toBe(100);
    expect(licenseAmount(4000, 800, 100, 10)).toBe(3200);
  });

  it("matches the worked example in the plan", () => {
    // $3.20 royalty, 10% fee, remix keeps 70% and passes 30% to the base pattern.
    const credits = splitRoyalty(320, [jun, maya], 1000);
    expect(credits).toEqual([
      { payeeKind: "designer", payeeId: "jun", patternId: "astro", amountCents: 201 },
      { payeeKind: "designer", payeeId: "maya", patternId: "clover", amountCents: 87 },
      { payeeKind: "platform", payeeId: "lineage", patternId: null, amountCents: 32 },
    ]);
  });

  it("pays everything to a single designer when there is no remix", () => {
    expect(splitRoyalty(999, [maya], 0)).toEqual([
      { payeeKind: "designer", payeeId: "maya", patternId: "clover", amountCents: 999 },
    ]);
  });

  it("always sums exactly, for any amount, fee and chain", () => {
    for (let i = 0; i < 2000; i++) {
      const total = Math.floor(Math.random() * 100000);
      const depth = 1 + Math.floor(Math.random() * 5);
      const chain = Array.from({ length: depth }, (_, d) => ({
        patternId: `p${d}`,
        designerId: `d${Math.floor(Math.random() * 3)}`,
        parentShareBp: Math.floor(Math.random() * 10001),
      }));
      const credits = splitRoyalty(total, chain, Math.floor(Math.random() * 3000));
      expect(sum(credits)).toBe(total);
      for (const credit of credits) expect(Number.isInteger(credit.amountCents) && credit.amountCents > 0).toBe(true);
    }
  });

  it("splits a sale between the maker and the lineage", () => {
    const { royalty, credits } = splitSale(4000, 800, 100, "ana", [jun, maya], 1000);
    expect(royalty).toBe(320);
    expect(credits[0]).toEqual({ payeeKind: "maker", payeeId: "ana", patternId: null, amountCents: 3680 });
    expect(sum(credits)).toBe(4000);
  });

  it("rejects fractional cents", () => {
    expect(() => splitRoyalty(1.5, [maya], 0)).toThrow();
  });
});

describe("PayPal amounts", () => {
  it("round-trips decimal strings", () => {
    expect(toPayPalValue(201)).toBe("2.01");
    expect(fromPayPalValue("2.01")).toBe(201);
    expect(fromPayPalValue("40")).toBe(4000);
    expect(fromPayPalValue("3.5")).toBe(350);
    expect(() => fromPayPalValue("1.234")).toThrow();
  });
});
