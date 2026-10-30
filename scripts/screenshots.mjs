// Screenshots of every page (desktop + phone, light + dark) for review and the Devpost gallery.
//   node scripts/screenshots.mjs <outDir> [baseUrl]
import { chromium } from "playwright-core";
const out = process.argv[2] ?? "screenshots";
const base = process.argv[3] ?? "http://localhost:3000";
const pages = (process.env.PAGES ?? "/,/snap,/market,/market/lst_astro_ana,/agent,/patterns,/patterns/pat_astro_bunny,/designers/new,/console,/console/studio,/offers,/eval").split(",");
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [name, viewport, scheme] of [["desktop", { width: 1440, height: 900 }, "light"], ["phone", { width: 400, height: 860 }, "light"], ["dark", { width: 1440, height: 900 }, "dark"]]) {
  if (process.env.ONLY && process.env.ONLY !== name) continue;
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const p of pages) {
    errors.length = 0;
    await page.goto(base + p, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(p.includes("studio") ? 4000 : 600);
    const file = `${out}/${name}${p.replace(/\//g, "_") || "_home"}.png`;
    await page.screenshot({ path: file, fullPage: !p.includes("studio") });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${name} ${p} ${overflow ? "OVERFLOW " : ""}${errors.length ? "ERRORS: " + errors.slice(0, 3).join(" | ") : "ok"}`);
  }
  await ctx.close();
}
await browser.close();
