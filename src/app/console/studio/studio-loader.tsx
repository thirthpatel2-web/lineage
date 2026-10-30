"use client";

import dynamic from "next/dynamic";
import type { ConsoleData } from "@/lib/console-data";

// AG Studio measures the DOM, so it only renders in the browser.
const Studio = dynamic(() => import("./studio-client").then((m) => m.StudioClient), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-muted">Loading AG Studio…</div>,
});

export function StudioLoader(props: { data: ConsoleData; licenseKey?: string; aiOn: boolean }) {
  return <Studio {...props} />;
}
