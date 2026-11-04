# Submission checklist

Deadline: **Nov 12, 2026, 12:00 PM Pacific (Nov 13, 01:30 IST)**. Confirm it on the Devpost page, and submit a day early.

Everything below needs your accounts, so it can't be done from code. Work top to bottom.

## 1. Keys (15 min)

Create `.env.local` in this folder (never commit it):

```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
PAYPAL_MERCHANT_EMAIL=          # your sandbox BUSINESS account email
DEMO_PAYEE_EMAIL=               # a sandbox PERSONAL account email; demo payouts go here and show as paid
ANTHROPIC_API_KEY=
```

Get them at developer.paypal.com > Apps & Credentials (Sandbox), and console.anthropic.com. In the PayPal app's features, turn on **Payouts**, **Invoicing** and **Transaction search**. Check that the sandbox business account has a balance.

## 2. Prove the real services work (5 min)

```bash
npm run preflight
```

It makes real sandbox and Claude calls and prints PASS / FAIL / SKIP for each. **Everything must say PASS except webhooks, which you set up after deploying.** If something fails, the line includes PayPal's debug id. Fix it before going further.

Then look at the real thing:

```bash
rm -rf .data        # fresh demo data using DEMO_PAYEE_EMAIL
npm run dev
npm run e2e         # in a second terminal; every flow, in a browser (pauses are normal)
```

`npm run e2e` can't log in to PayPal's real approval page, so with real keys do the Snap & license and Market purchases by hand once, using your sandbox buyer. Also ask the AG Studio assistant one question: this is its first real Claude run.

## 3. Publish the code (2 min)

```bash
gh repo create lineage --public --source . --push
```

This publishes the code and its commit history, including the name and email on each commit. To change the email first, tell Claude Code which address to use.

## 4. Deploy (15 min)

Render > New > Blueprint > pick the repo. It reads `render.yaml`. In the dashboard set `APP_URL` (on both the web service and the cron job), the keys from step 1 and `DEMO_PAYEE_EMAIL`.

Then add a webhook in your PayPal app:

- URL: `https://YOUR-APP.onrender.com/api/webhooks/paypal`
- Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `INVOICING.INVOICE.PAID`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `.UNCLAIMED`, `.RETURNED`, `.FAILED`, `.BLOCKED`

Put its id in `PAYPAL_WEBHOOK_ID` on Render. Open the site in a private window and run through `JUDGES.md`.

## 5. Real photos (the biggest quality jump)

The accuracy numbers come from drawings, and judges will notice. Crochet or borrow a few items and take 5 or more photos of each:

```
photos/<pattern-id>/*.jpg     # e.g. photos/pat_clover_bunny/1.jpg
photos/_none/*.jpg            # things nobody registered
```

Register your real patterns at `/designers/new` first, then run `npm run eval -- --photos ./photos`. Update the Accuracy row in `README.md` and the number in `docs/DEVPOST.md` with what you get, even if it's lower.

Only use photos and patterns you made or have written permission for.

## 6. Video (1-2 hours)

Follow `docs/VIDEO_SCRIPT.md`. Must be under 3:00, public on YouTube, and show real sandbox payments.

## 7. Devpost (20 min)

1. Replace `APP_URL_HERE`, `REPO_URL_HERE` and `VIDEO_URL_HERE` in `JUDGES.md` and `docs/DEVPOST.md`. Commit and push.
2. Read the **Before you paste** box at the top of `docs/DEVPOST.md` and delete anything that isn't true yet.
3. Paste each section. Upload `docs/screenshots/*` to the gallery (retake them from the deployed site first, so the header shows the live badges: `node scripts/gallery.mjs`).
4. Put a sandbox buyer login in Devpost's private testing field, never in the repo.
5. Check the official rules once for eligibility (your country and age) and team details.
6. Submit, then open the public page in a private window and check every link.

## Optional

- `AG_STUDIO`: a licence key removes the watermark in AG Studio. Ask AG Grid; it may matter for their prize.
- `CHANNEL3_API_KEY`: real outside listings for the shopping agent. Without it the agent uses labelled sample listings. The Channel3 integration has never run against the real API, so test it before you mention it.
