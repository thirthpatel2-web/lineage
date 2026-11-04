# Devpost submission text

Copy each section into the matching Devpost field. Replace the placeholders in CAPS.

> **Before you paste.** Some of this describes what the code is built to do but hasn't been confirmed yet. Delete or reword anything still untrue:
> - "with real PayPal objects": true once `npm run preflight` passes and you've done a purchase in the sandbox.
> - The remix-vs-base claim under Challenges: true once you've seen Claude vision get it right. The measured 99% is embeddings only.
> - "(via Channel3)": only if you set a Channel3 key and tested it. Otherwise say "other marketplaces (labelled sample data)".
> - The 99% / 100% / 0.6% numbers: replace with your real-photo results if you have them.
> - The AG Studio assistant: it has only run against a stand-in. Try it once with your key.

---

## Name

Lineage

## Tagline

Royalty, not takedown: AI finds who designed a handmade item, and PayPal pays them.

## Inspiration

Crochet, knitting and sewing designers sell a pattern once for a few dollars, then watch finished items made from it sell for $40 each. Their only tool is a takedown report, which earns nobody anything and punishes makers who usually just didn't know who to pay. Remixes make it worse: when someone turns a bunny into an astronaut bunny, the original designer disappears from the story.

YouTube solved this for video with Content ID: a match can earn the rights holder money instead of removing the video. Nothing like that exists for physical goods. Modern vision models can recognise a pattern in a finished object, and PayPal can pay anyone with an email address, so we built it.

## What it does

- **Snap & license.** A maker photographs something they made. Lineage Lens finds the pattern and every designer up the remix chain, shows the designer's terms, and licenses it with one PayPal Checkout payment.
- **Royalties up the chain.** A remix pays its own designer and the original pattern's designer, split to the cent, through one weekly PayPal Payouts batch.
- **Provenance tags.** Each licensed item gets a QR tag. Buyers scan it to see who designed what they're holding.
- **Fair by design.** Classic designs nobody owns, like a granny square, are never charged. Patterns whose designer forbids selling can't be licensed. If Lineage isn't confident about a match, it refuses to contact anyone.
- **License offers instead of takedowns.** A designer submits a listing they found. Lineage confirms the match, Claude drafts a friendly offer, and once the designer approves it goes out as a PayPal invoice.
- **Agentic commerce.** Lineage is an MCP server with six tools, and every pattern publishes a machine-readable `lineage.json` license. Our shopping agent (Claude) searches Lineage Market and other marketplaces (via Channel3), checks every outside listing's provenance, skips unlicensed copies, and prepares a PayPal checkout that a person approves.
- **Royalty console.** An AG Grid ledger of every credit and payout, plus an AG Studio dashboard whose AI assistant runs on Claude.

## How we built it

- **Next.js 15 + TypeScript**, Postgres via Drizzle (embedded PGlite locally, so `npm install && npm run dev` just works).
- **Lineage Lens:** CLIP ViT-B/32 embeddings run locally (ONNX) to shortlist candidate patterns; Claude Opus 5.5 then compares construction details across the photos with structured output, explains its reasoning, and flags traditional designs. Plain code turns scores into strong / possible / none bands.
- **PayPal:** Orders v2 for licenses and Market purchases, Payouts for royalties, Invoicing v2 for license offers, Webhooks with signature verification, and Transaction Search behind a "Reconcile with PayPal" button.
- **Money safety:** integer cents and basis points; credits written only after a verified `COMPLETED` capture for the exact amount; idempotent capture, webhook and payout handling (`PayPal-Request-Id`, unique `sender_batch_id`, conditional state flips); 2,000-case randomized test that every split sums exactly.
- **Agents:** the Anthropic SDK Tool Runner drives the shopping agent; the same tool functions back a stateless Streamable HTTP MCP server built with the official MCP SDK.
- **AG Studio:** we wrote a custom `AgLlmAdapter` that proxies AG Studio's assistant turns to Claude on our server, translating tool calls both ways.
- **Render** blueprint with Postgres and a weekly payout cron.

## Challenges we ran into

- **Telling a remix from its base.** Embedding similarity alone sometimes confused Astronaut Bunny with Clover Bunny, because they share a body. Adding a vision verification step that looks for the remix's added parts (helmet ring, jetpack) is what makes royalty splits trustworthy.
- **Not hurting honest makers.** We added confidence bands, a traditional-design guard, a "won't draft an offer when unsure" rule, and a measured false-match rate, so the system never accuses someone on a weak match.
- **Exactly-once money.** Return URLs, webhooks and manual refreshes can all try to record the same capture. We made every money step idempotent and only let the request that flips a row's state write credits.

## Accomplishments that we're proud of

- 99% top-1 and 100% top-3 accuracy with a 0.6% false-match rate on our 160-image test set (illustrations; see "What's next").
- A complete loop with real PayPal objects: photo → match → checkout → capture → ledger → Payouts batch → QR tag a buyer can scan.
- An MCP server and `lineage.json` license format that let any AI agent shop responsibly.

## What we learned

PayPal Payouts is a remarkably good fit for creator royalties: recipients need only an email, and unclaimed money comes back. Splitting a royalty up a remix chain is simple once everything is integer cents with the rounding remainder going to the base designer.

## What's next for Lineage

- Replace the illustrated test set with hundreds of photographed makes from partner designers, and publish the accuracy report.
- Expand beyond crochet to knitting, sewing and 3D-print files.
- Marketplace integrations, so licensed listings show a "designer paid" badge.
- Publish `lineage.json` as an open spec.

## Built with

nextjs, typescript, react, tailwindcss, postgresql, drizzle, pglite, paypal-orders-api, paypal-payouts-api, paypal-invoicing-api, paypal-webhooks, claude, anthropic-sdk, clip, onnx-runtime, transformers.js, model-context-protocol, ag-grid, ag-studio, channel3, render

## AI tools used (required disclosure)

- **Claude Opus 5.5** (`claude-opus-5-5`, Anthropic API): vision verification of pattern matches, license-term extraction, offer drafting, the shopping agent, and the AG Studio assistant.
- **CLIP ViT-B/32** (`Xenova/clip-vit-base-patch32`, run locally with Transformers.js / ONNX Runtime): image embeddings for the first matching stage.
- **Claude Code** was used as a coding assistant during development.

## Links

- Demo: APP_URL_HERE
- Code: REPO_URL_HERE
- Video: VIDEO_URL_HERE

## Prize categories we're entering

Best Overall · Most Creative · Best Use of Agentic Commerce · Best Use of PayPal + AI · AG Grid: Best Use of AG Studio
