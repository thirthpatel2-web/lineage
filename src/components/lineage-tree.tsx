import Link from "next/link";

export type TreeNode = { id: string; title: string; designer: string; parentShareBp: number; imageId?: string | null };

/**
 * A vertical lineage: base pattern at the top, the matched pattern below it, and optionally the
 * finished item at the bottom. Green stitches show royalties flowing up.
 */
export function LineageTree({ chain, item, highlight }: { chain: TreeNode[]; item?: { label: string; sub?: string; imageId?: string | null }; highlight?: string }) {
  const top = [...chain].reverse(); // base first
  return (
    <ol className="flex flex-col items-stretch" aria-label="Pattern lineage, base pattern first">
      {top.map((node, i) => {
        const isBase = i === 0;
        const child = top[i + 1];
        return (
          <li key={node.id} className="flex flex-col items-center">
            <Link
              href={`/patterns/${node.id}`}
              className={`card flex w-full items-center gap-3 p-3 transition hover:border-accent ${node.id === highlight ? "ring-2 ring-accent" : ""}`}
            >
              {node.imageId && <img src={`/api/images/${node.imageId}`} alt="" className="size-12 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[0.68rem] uppercase tracking-widest text-muted">{isBase ? (top.length > 1 ? "Base pattern" : "Pattern") : "Remix"}</div>
                <div className="truncate font-display text-lg font-bold">{node.title}</div>
                <div className="text-sm text-muted">by {node.designer}</div>
              </div>
            </Link>
            {(child || item) && <Connector label={child ? `${100 - child.parentShareBp / 100}% stays · ${child.parentShareBp / 100}% flows up` : "royalty flows up"} />}
          </li>
        );
      })}
      {item && (
        <li className="flex flex-col items-center">
          <div className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line p-3">
            {item.imageId && <img src={`/api/images/${item.imageId}`} alt="" className="size-12 rounded-lg object-cover" />}
            <div>
              <div className="font-mono text-[0.68rem] uppercase tracking-widest text-muted">Finished item</div>
              <div className="font-display font-bold">{item.label}</div>
              {item.sub && <div className="text-sm text-muted">{item.sub}</div>}
            </div>
          </div>
        </li>
      )}
    </ol>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <svg width="16" height="40" viewBox="0 0 16 40" aria-hidden="true">
        <line x1="8" y1="0" x2="8" y2="40" stroke="var(--line)" strokeWidth="3" />
        <line x1="8" y1="40" x2="8" y2="0" stroke="var(--money)" strokeWidth="3" className="stitch-flow" />
      </svg>
      <span className="font-mono text-[0.7rem] text-muted">{label}</span>
    </div>
  );
}
