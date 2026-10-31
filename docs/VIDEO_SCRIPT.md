# Demo video script (target 2:50, hard limit under 3:00)

Record at 1440×900 in the browser, with the PayPal sandbox and Claude keys live, so the header shows **PayPal sandbox** and **Claude vision on**. Use a real crocheted bunny if you have one; otherwise use the samples. Speak over the screen; no talking-head intro.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:12 | A takedown notice email, then the Lineage home page hero | "Makers sell things made from someone else's pattern every day. The designer's only tool is a takedown, and that earns nobody anything. Lineage turns that takedown into a royalty." |
| 0:12–0:30 | **Register a pattern**: type the terms, click *Read my terms with AI*, show the structured terms | "Maya designed Clover Bunny. She writes her terms in plain words, and Claude turns them into a license she confirms." |
| 0:30–1:00 | **Snap & license**: photograph the astronaut bunny, show the match, the feature scores, the lineage tree | "Ana made an astronaut bunny. She snaps it. Lineage Lens shortlists patterns with image embeddings, then Claude checks the construction: the helmet ring, the jetpack, the clover. It's Jun's remix of Maya's bunny, so both of them get paid." |
| 1:00–1:20 | Pay $40 with PayPal (sandbox login + approve), land on the receipt with the split and QR tags | "One PayPal payment licenses ten bunnies. The split is exact to the cent, and every bunny gets a provenance tag." Scan a tag with the phone on camera. |
| 1:20–1:50 | **Agents** page: run the astronaut bunny prompt; expand a *check_provenance* step | "Now an AI shopping agent. It finds two outside listings, checks them against Lineage, and skips both because they're unlicensed copies. It recommends Ana's licensed bunny and prepares a PayPal checkout that I approve. Any agent can do this through our MCP server." |
| 1:50–2:20 | **Royalties**: Run payouts now → rows turn paid; open AG Studio, ask the assistant "Which designer earned most?" | "Every week PayPal Payouts pays each designer by email. The console is AG Grid, and the AG Studio assistant runs on Claude." |
| 2:20–2:35 | Snap the granny square ("No license needed"), then the frog ("not for sale") | "It's fair by design: classic designs nobody owns are never charged, and if the designer says no, Lineage won't sell a license." |
| 2:35–2:50 | **Offers**: approve and send the PayPal invoice; end on the home page hero with designer quotes | "And instead of takedowns, designers send license offers as PayPal invoices. Lineage: royalty, not takedown. Built on PayPal." |

Checklist before recording: fresh database (`rm -rf .data && npm run dev`), keys set, browser zoom 100%, notifications off, a sandbox buyer logged out so the PayPal login is shown once.
