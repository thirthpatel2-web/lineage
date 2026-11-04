// Demo designers, patterns (with a remix), makers and listings. Safe to re-run: it only inserts
// what is missing. Demo rows are flagged `demo` and every image is an illustration.

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { renderJpeg, type DesignKey } from "@/lib/demo-art";
import { storeImage } from "@/lib/images";

const DESIGNERS = [
  { id: "des_maya", name: "Maya Okafor", handle: "maya", paypalEmail: "maya.designer@example.com", bio: "Designs soft toys with tiny garden details." },
  { id: "des_jun", name: "Jun Park", handle: "jun", paypalEmail: "jun.designer@example.com", bio: "Remixes classics into space adventurers." },
  { id: "des_priya", name: "Priya Raman", handle: "priya", paypalEmail: "priya.designer@example.com", bio: "Sea creatures, mostly with hats." },
  { id: "des_tomas", name: "Tomás Rivera", handle: "tomas", paypalEmail: "tomas.designer@example.com", bio: "Sleepy animals for nurseries." },
  { id: "des_ines", name: "Inès Laurent", handle: "ines", paypalEmail: "ines.designer@example.com", bio: "Pond life in chunky yarn." },
];

type SeedPattern = typeof schema.patterns.$inferInsert & { design: DesignKey };

const PATTERNS: SeedPattern[] = [
  {
    id: "pat_clover_bunny", design: "clover-bunny", designerId: "des_maya", title: "Clover Bunny",
    description: "A round bunny with tall lined ears and a four-leaf clover stitched on its belly.",
    licenseText: "You can sell bunnies you make from this pattern. Please credit me (Maya Okafor) on the tag. 8% of the sale price feels fair to me.",
    rateBp: 800, features: ["Tall lined ears", "Clover appliqué on belly", "Oval feet"],
  },
  {
    id: "pat_astro_bunny", design: "astronaut-bunny", designerId: "des_jun", title: "Astronaut Bunny",
    description: "Clover Bunny in a space suit: helmet ring, collar and jetpack with two buttons.",
    licenseText: "Finished items may be sold with credit to Jun Park and to Maya Okafor, who designed the original bunny. Royalty 10%.",
    rateBp: 1000, parentId: "pat_clover_bunny", parentShareBp: 3000, features: ["Helmet ring", "Jetpack with two buttons", "Clover Bunny body"],
  },
  {
    id: "pat_lighthouse_octopus", design: "lighthouse-octopus", designerId: "des_priya", title: "Lighthouse Octopus",
    description: "An eight-legged octopus wearing a striped lighthouse hat with a glowing top.",
    licenseText: "Sell what you make! Credit Priya Raman. Small batches only, up to 50 items.",
    rateBp: 700, batchLimit: 50, features: ["Striped lighthouse hat", "Alternating curled legs"],
  },
  {
    id: "pat_sleepy_whale", design: "sleepy-whale", designerId: "des_tomas", title: "Sleepy Whale",
    description: "A whale with closed eyes, a white belly panel and a navy nightcap.",
    licenseText: "Finished items can be sold. Credit appreciated but not required. 6%.",
    rateBp: 600, creditRequired: false, features: ["Closed eyes", "Nightcap", "Belly panel"],
  },
  {
    id: "pat_fern_frog", design: "fern-frog", designerId: "des_ines", title: "Fern Frog",
    description: "A chunky frog with bulging eyes and a curled fern leaf on its head.",
    licenseText: "Personal use only. Please do not sell finished items made from this pattern.",
    rateBp: 800, salesAllowed: false, features: ["Fern leaf hat", "Bulging eyes"],
  },
];

const MAKERS = [
  { id: "mkr_ana", name: "Ana Souza", shopName: "Ana's Market Stall", paypalEmail: "ana.maker@example.com" },
  { id: "mkr_leo", name: "Leo Chen", shopName: "Leo Makes Things", paypalEmail: "leo.maker@example.com" },
];

const LISTINGS = [
  { id: "lst_astro_ana", makerId: "mkr_ana", patternId: "pat_astro_bunny", design: "astronaut-bunny" as DesignKey, seed: 9101, title: "Astronaut Bunny, mint yarn", priceCents: 4000, stock: 6 },
  { id: "lst_clover_leo", makerId: "mkr_leo", patternId: "pat_clover_bunny", design: "clover-bunny" as DesignKey, seed: 9102, title: "Clover Bunny, peach", priceCents: 3200, stock: 4 },
  { id: "lst_octo_ana", makerId: "mkr_ana", patternId: "pat_lighthouse_octopus", design: "lighthouse-octopus" as DesignKey, seed: 9103, title: "Lighthouse Octopus, coral", priceCents: 3800, stock: 3 },
  { id: "lst_whale_leo", makerId: "mkr_leo", patternId: "pat_sleepy_whale", design: "sleepy-whale" as DesignKey, seed: 9104, title: "Sleepy Whale nursery toy", priceCents: 4500, stock: 2 },
];

// Reference photos use seeds 1..3 per pattern; the evaluation set uses seeds from 1000 up, so
// test images are never the same as the references.
const REFERENCE_SEEDS = [11, 23, 37];

export async function seedDemo(log: (line: string) => void = () => {}) {
  const db = await getDb();
  const consentAt = new Date();

  // Sandbox payouts only show as paid when they reach a real sandbox account.
  const payee = process.env.DEMO_PAYEE_EMAIL?.trim();
  for (const d of DESIGNERS) {
    await db.insert(schema.designers).values({ ...d, paypalEmail: payee || d.paypalEmail, consentAt, demo: true }).onConflictDoNothing();
  }
  for (const { design, ...p } of PATTERNS) {
    const inserted = await db.insert(schema.patterns).values(p).onConflictDoNothing().returning();
    if (inserted.length === 0) continue;
    for (const [i, seed] of REFERENCE_SEEDS.entries()) {
      await storeImage(await renderJpeg(design, seed * 97 + i), "pattern", p.id);
    }
    log(`pattern  ${p.title}`);
  }
  for (const m of MAKERS) {
    await db.insert(schema.makers).values({ ...m, paypalEmail: payee || m.paypalEmail, demo: true }).onConflictDoNothing();
  }
  for (const { design, seed, ...l } of LISTINGS) {
    const exists = await db.query.listings.findFirst({ where: eq(schema.listings.id, l.id) });
    if (exists) continue;
    const image = await storeImage(await renderJpeg(design, seed), "listing");
    await db.insert(schema.listings).values({ ...l, imageId: image.id });
    log(`listing  ${l.title}`);
  }
  log("Seed complete.");
}
