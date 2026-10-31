# Judge guide (5 minutes)

Hosted demo: **APP_URL_HERE** · Video: **VIDEO_URL_HERE**

The header shows which integrations are live: "PayPal sandbox" and "Claude vision on" on the hosted demo.
Sandbox buyer login for PayPal: see the private testing field on Devpost.

## 1. A maker licenses a remix (2 min)

1. Open **Snap & license** and click the **Astronaut bunny** sample (or upload your own photo).
2. Lineage matches it to *Astronaut Bunny* by Jun Park and traces it up to *Clover Bunny* by Maya Okafor. Read Claude's explanation and feature scores.
3. Keep 10 items at $40 and click **Pay with PayPal**. Log in with the sandbox buyer and approve.
4. You land on the receipt: the PayPal order and capture ids, the split (Jun $25.20, Maya $10.80, Lineage $4.00), and 10 QR provenance tags. Scan one with your phone.

## 2. Designers get paid (1 min)

1. Open **Royalties** and click **Run payouts now**. Lineage sends one PayPal Payouts batch.
2. Rows turn **paid** as PayPal confirms them (click **Refresh statuses from PayPal** if needed).
3. Open the **AG Studio dashboard** and ask the assistant: *"Which designer earned the most, and how much is paid out?"*

## 3. Agentic commerce (1 min)

1. Open **Agents** and run *"Find a licensed astronaut bunny under $45 for my niece and buy it."*
2. Watch it check two outside listings, flag both as **unlicensed copies**, and prepare a PayPal checkout for the licensed one. Expand any step to see the raw tool input and output.
3. Optional: add `APP_URL/mcp` to Claude Desktop or any MCP client and use the same tools yourself.

## 4. Fairness checks (30 s)

- Snap the **Granny square** sample: it's a traditional design, so no license is offered.
- Snap the **Frog** sample: its designer doesn't allow selling finished items, so Lineage refuses to sell a license.
- On **Offers**, try the **Unrelated cat toy**: Lineage refuses to draft an offer because it isn't confident, to avoid accusing an honest maker.

## Run it yourself

```bash
git clone REPO_URL_HERE && cd lineage
npm install && npm run dev
```

It works with no keys (offline mode). See the README to add PayPal sandbox and Claude keys.
