import Link from "next/link";
import { connection } from "next/server";
import { formatCents } from "@/lib/money";
import { stats } from "@/lib/queries";

export default async function Home() {
  await connection();
  const s = await stats();

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid items-center gap-10 py-14 md:grid-cols-[1.15fr_.85fr] md:py-20">
        <div className="rise">
          <div className="eyebrow">Like YouTube Content ID, for handmade things</div>
          <h1 className="mt-4 font-display text-6xl font-extrabold leading-[0.92] tracking-tight md:text-8xl">
            Royalty,
            <br />
            not <span className="text-accent">takedown.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Pattern designers get paid when people sell what they made from their patterns. No lawyers, no takedowns. Snap a photo of something you
            crocheted, sewed or 3D-printed: Lineage finds the pattern and every designer it was remixed from, one PayPal payment licenses it, and PayPal
            Payouts pays each designer their share.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/snap?sample=astronaut" className="btn btn-accent">Try it: match a sample bunny →</Link>
            <Link href="/designers/new" className="btn btn-ghost">I design patterns</Link>
            <Link href="/agent" className="btn btn-ghost">I&apos;m an AI agent</Link>
          </div>
        </div>
        <HeroTree />
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4" aria-label="Live numbers">
        <Stat k="Patterns registered" v={String(s.patterns)} />
        <Stat k="Licenses paid" v={String(s.licenses)} sub={`${s.units} finished items`} />
        <Stat k="Royalties earned" v={formatCents(s.royaltiesCents)} />
        <Stat k="Paid out via PayPal" v={formatCents(s.paidCents)} />
      </section>

      <div className="stitch my-16" role="separator" />

      <section className="grid gap-6 md:grid-cols-3">
        <Step n="1" title="Find the pattern" body="Lineage Lens compares the photo with every registered pattern: first by image similarity, then Claude checks construction details like ear shaping or a helmet ring, and explains its answer." />
        <Step n="2" title="License in one tap" body="The maker sees the designer's own terms and pays through PayPal Checkout. Classic designs nobody owns, like a granny square, are never charged." />
        <Step n="3" title="Pay everyone in the chain" body="A remix pays its designer and the original pattern's designer, split to the cent. A weekly PayPal Payouts batch sends the money to their email." />
      </section>

      <div className="stitch my-16" role="separator" />

      <section className="grid gap-8 pb-20 md:grid-cols-2">
        <div>
          <div className="eyebrow">For AI agents</div>
          <h2 className="mt-3 text-4xl font-extrabold">Shopping agents can check where an item came from</h2>
          <p className="mt-4 text-muted">
            Every pattern publishes a machine-readable <code className="font-mono text-ink">lineage.json</code> license, and Lineage runs an MCP server.
            Claude, ChatGPT or any agent can check provenance, skip unlicensed copies, and prepare a PayPal checkout that a person approves.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/agent" className="btn">Watch the shopping agent</Link>
            <Link href="/patterns/pat_astro_bunny/lineage.json" className="btn btn-ghost">See a machine-readable license</Link>
          </div>
        </div>
        <pre className="card overflow-x-auto p-5 font-mono text-[0.8rem] leading-relaxed text-muted">
{`> check_provenance(image_url)
{
  "licensed": false,
  "match": "strong",
  "matched_pattern_id": "pat_astro_bunny",
  "lineage": [
    { "title": "Astronaut Bunny", "designer": "Jun Park" },
    { "title": "Clover Bunny", "designer": "Maya Okafor" }
  ],
  "advice": "Sold without a license. Prefer a
             licensed listing on Lineage Market."
}`}
        </pre>
      </section>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="bg-surface p-5">
      <div className="font-mono text-[0.7rem] uppercase tracking-widest text-muted">{k}</div>
      <div className="mt-1 font-display text-3xl font-extrabold tabular-nums">{v}</div>
      {sub && <div className="text-sm text-muted">{sub}</div>}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="card p-6">
      <div className="grid size-9 place-items-center rounded-full bg-ink font-display font-extrabold text-bg">{n}</div>
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}

function HeroTree() {
  return (
    <figure className="m-0">
      <svg viewBox="0 0 440 380" className="h-auto w-full" role="img" aria-label="A base pattern by Maya is remixed by Jun; three makers sell finished items; royalties flow back up to both designers.">
        <g fill="none" strokeWidth="3">
          <path d="M220 92 V150" stroke="var(--line)" />
          <path d="M220 210 C220 250 80 250 80 290" stroke="var(--line)" />
          <path d="M220 210 V290" stroke="var(--line)" />
          <path d="M220 210 C220 250 360 250 360 290" stroke="var(--line)" />
          <path d="M80 290 C80 250 220 250 220 210" stroke="var(--money)" className="stitch-flow" />
          <path d="M220 290 V210" stroke="var(--money)" className="stitch-flow" />
          <path d="M360 290 C360 250 220 250 220 210" stroke="var(--money)" className="stitch-flow" />
          <path d="M220 150 V92" stroke="var(--money)" className="stitch-flow" />
        </g>
        <rect x="110" y="22" width="220" height="70" rx="14" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />
        <text x="130" y="44" fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="11">BASE PATTERN · 30%</text>
        <text x="130" y="68" fill="var(--ink)" fontFamily="var(--font-display)" fontWeight="700" fontSize="17">Clover Bunny</text>
        <text x="130" y="84" fill="var(--muted)" fontSize="12">by Maya</text>
        <rect x="110" y="150" width="220" height="60" rx="14" fill="var(--surface)" stroke="var(--accent)" strokeDasharray="4 4" />
        <text x="130" y="172" fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="11">REMIX · 70%</text>
        <text x="130" y="196" fill="var(--ink)" fontFamily="var(--font-display)" fontWeight="700" fontSize="17">Astronaut Bunny</text>
        {[
          [20, "Ana's stall", "licensed"],
          [160, "Leo's shop", "licensed"],
          [300, "Online listing", "offer sent"],
        ].map(([x, a, b]) => (
          <g key={String(a)}>
            <rect x={Number(x)} y="290" width="120" height="58" rx="12" fill="var(--surface)" stroke="var(--line)" />
            <text x={Number(x) + 14} y="314" fill="var(--ink)" fontFamily="var(--font-display)" fontWeight="700" fontSize="14">{a}</text>
            <text x={Number(x) + 14} y="334" fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="11">{b}</text>
          </g>
        ))}
        <circle cx="372" cy="120" r="26" fill="var(--money)" />
        <text x="372" y="124" fill="var(--bg)" fontFamily="var(--font-mono)" fontSize="10" fontWeight="700" textAnchor="middle">PayPal</text>
        <text x="342" y="164" fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="11">Payouts</text>
      </svg>
    </figure>
  );
}
