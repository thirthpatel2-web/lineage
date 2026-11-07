import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";

export const metadata: Metadata = { title: "Accuracy" };
export const dynamic = "force-dynamic";

type Report = {
  generatedAt: string;
  method: "vision" | "embedding";
  dataset: "illustrations" | "photos";
  photos: number;
  positives: number;
  negatives: number;
  top1: number;
  top3: number;
  falseMatch: number;
  negativesRejected: number;
  confusion: Record<string, Record<string, number>>;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function EvalPage() {
  const file = path.join(process.cwd(), "eval", "report.json");
  const report: Report | null = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="eyebrow">Accuracy</div>
      <h1 className="mt-3 text-5xl font-extrabold">How accurate is Lineage Lens?</h1>
      <p className="mt-3 max-w-3xl text-muted">
        A wrong match could accuse an honest maker, so we measure how often Lineage gets it right. The test runs the same matcher the app uses
        on a labelled test set, including items nobody registered, and writes this report.
      </p>
      {!report ? (
        <p className="card mt-8 p-6">No report yet. Run <code className="font-mono">npm run eval</code>.</p>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="pill pill-plain">{report.method === "vision" ? "Image similarity + AI vision" : "Image similarity only (no Claude)"}</span>
            <span className="pill pill-plain">{report.dataset === "photos" ? "real photos" : "illustrated stand-ins"}</span>
            <span className="pill pill-plain">{report.photos} test images</span>
            <span className="pill pill-plain">{new Date(report.generatedAt).toLocaleString()}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
            <Metric k="Top-1 accuracy" v={pct(report.top1)} hint="Right pattern ranked first" />
            <Metric k="Top-3 accuracy" v={pct(report.top3)} hint="Right pattern in the shortlist" />
            <Metric k="False-match rate" v={pct(report.falseMatch)} hint="Confident and wrong" />
            <Metric k="Unknowns rejected" v={pct(report.negativesRejected)} hint="Unregistered items left alone" />
          </div>
          {report.dataset === "illustrations" && (
            <p className="mt-4 rounded-xl bg-warn-soft p-4 text-sm text-warn">
              Tested on {report.photos} varied illustrations, not real photos{report.method === "vision" ? "" : ", and without the AI vision step"}. Real photos
              are harder, so expect lower numbers until photographed items are tested.
            </p>
          )}
          <div className="card mt-8 overflow-x-auto p-6">
            <h2 className="text-xl font-bold">What each pattern was matched as</h2>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2 pr-4 font-mono text-xs uppercase">True pattern</th>
                  <th className="py-2 font-mono text-xs uppercase">Matched as</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.confusion).map(([truth, row]) => (
                  <tr key={truth} className="border-t border-line">
                    <td className="py-2 pr-4 font-mono">{truth}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(row).map(([got, n]) => (
                          <span key={got} className={`pill ${got === truth ? "pill-good" : "pill-bad"}`}>{got} × {n}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div className="bg-surface p-5">
      <div className="font-mono text-[0.68rem] uppercase tracking-widest text-muted">{k}</div>
      <div className="mt-1 font-display text-4xl font-extrabold tabular-nums">{v}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}
