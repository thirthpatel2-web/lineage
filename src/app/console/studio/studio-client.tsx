"use client";

import { useMemo, useState } from "react";
import { AgStudioAiModule, createAiHarness, type AgAiHarnessSetup, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import type { ConsoleData } from "@/lib/console-data";
import { claudeAdapter } from "./claude-adapter";
import { buildStudioData, initialReport } from "./studio-data";

const PROMPT_STARTERS = [
  { label: "Who earned most?", prompt: "Which designer earned the most royalties, and how much of it has PayPal already paid out?" },
  { label: "Remix vs original", prompt: "Add a chart comparing royalties from remixes with royalties from original patterns." },
  { label: "Unpaid balances", prompt: "Add a table of payees with pending credits that have not been paid out yet, largest first." },
];

export function StudioClient({ data, licenseKey, aiOn }: { data: ConsoleData; licenseKey?: string; aiOn: boolean }) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  const studioData = useMemo(() => buildStudioData(data), [data]);
  const ai = useMemo<AgAiHarnessSetup | undefined>(
    () => (aiOn ? ({ api }) => createAiHarness(api, { adapter: claudeAdapter(), promptStarters: PROMPT_STARTERS }) : undefined),
    [aiOn],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        {(["view", "edit"] as AgStudioMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 text-sm font-bold ${mode === m ? "bg-ink text-bg" : "text-muted hover:bg-sunk"}`}>
            {m === "view" ? "View" : "Edit"}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted">Edit mode lets you add widgets by hand or ask the AI assistant to build them.</span>
      </div>
      <div className="min-h-0 flex-1">
        <AgStudioProvider licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
          <AgStudio style={{ height: "100%", width: "100%" }} layout={{ widgetBorderEnabled: true }} data={studioData} ai={ai} initialState={initialReport} mode={mode} />
        </AgStudioProvider>
      </div>
    </div>
  );
}
