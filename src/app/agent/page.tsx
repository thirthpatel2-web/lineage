import type { Metadata } from "next";
import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env, mode } from "@/lib/env";
import { AgentClient } from "./agent-client";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentPage() {
  await connection();
  const db = await getDb();
  const recent = await db.select().from(schema.agentRuns).orderBy(desc(schema.agentRuns.createdAt)).limit(5);
  const config = JSON.stringify({ mcpServers: { lineage: { type: "http", url: `${env.appUrl}/mcp` } } }, null, 2);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="eyebrow">Agentic commerce</div>
      <h1 className="mt-3 text-5xl font-extrabold">Shopping agents that respect designers</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Ask for a handmade gift. The agent searches Lineage Market and other marketplaces, checks every outside listing&apos;s provenance with Lineage Lens,
        skips unlicensed copies, and prepares a PayPal checkout that you approve. Every step is recorded below.
      </p>
      <AgentClient aiOn={mode.ai} />

      <div className="stitch my-12" role="separator" />

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold">Use Lineage from your own agent</h2>
          <p className="mt-2 text-muted">
            Lineage is an MCP server. Add it to Claude Desktop, Claude Code, ChatGPT connectors, the OpenAI Agents SDK or LangChain, and your agent gets six
            tools: <code className="font-mono text-ink">find_licensed_items</code>, <code className="font-mono text-ink">check_provenance</code>,{" "}
            <code className="font-mono text-ink">get_license_terms</code>, <code className="font-mono text-ink">quote_license</code>,{" "}
            <code className="font-mono text-ink">buy_license</code> and <code className="font-mono text-ink">buy_item</code>.
          </p>
          <p className="mt-2 text-muted">Purchases always return a PayPal link for a person to approve. Agents never move money on their own.</p>
        </div>
        <pre className="card overflow-x-auto p-5 font-mono text-sm">{config}</pre>
      </section>

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-extrabold">Recent agent runs</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {recent.map((r) => (
              <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1">&ldquo;{r.prompt}&rdquo;</span>
                <span className="pill pill-plain">{r.steps.filter((s) => s.kind === "tool").length} tool calls</span>
                <span className="pill pill-plain">{r.agent === "shopper" ? "Claude" : "Demo script"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
