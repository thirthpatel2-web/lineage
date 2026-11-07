import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import { aiName, mode } from "@/lib/env";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: "Lineage · Royalty, not takedown", template: "%s · Lineage" },
  description: "Lineage finds the pattern a handmade item came from and pays every designer in its remix chain through PayPal.",
};

const NAV = [
  { href: "/snap", label: "Snap & license" },
  { href: "/market", label: "Market" },
  { href: "/agent", label: "Agents" },
  { href: "/console", label: "Royalties" },
  { href: "/patterns", label: "Patterns" },
  { href: "/offers", label: "Offers" },
  { href: "/eval", label: "Accuracy" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold">
              <Logo /> Lineage
            </Link>
            <NavLinks items={NAV} />
            {mode.paypal && mode.ai ? (
              <span className="pill pill-good shrink-0" title={`Payments use the real PayPal sandbox and matching uses ${aiName} vision. No real money moves.`}>
                PayPal sandbox · {aiName}
              </span>
            ) : (
              <span
                className="pill pill-plain shrink-0"
                title={`${mode.paypal ? "Payments use the real PayPal sandbox." : "Payments use a built-in PayPal stand-in."} ${mode.ai ? `Matching uses ${aiName} vision.` : "Matching uses image similarity only, without an AI vision model."} No real money moves.`}
              >
                Demo mode
              </span>
            )}
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
            <span>
              Lineage · PayPal AI Hackathon 2026 · Designed &amp; built by <strong className="text-ink">Thirth Patel</strong>
            </span>
            <span className="font-mono text-xs">Test payments only. No real money moves.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
