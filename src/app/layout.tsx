import type { Metadata } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { mode } from "@/lib/env";
import { Logo } from "@/components/logo";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "700", "800"] });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], variable: "--font-atkinson", weight: ["400", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", weight: ["400", "600"] });

export const metadata: Metadata = {
  title: { default: "Lineage · Royalty, not takedown", template: "%s · Lineage" },
  description: "Lineage finds the pattern a handmade item came from and pays every designer in its remix chain through PayPal.",
};

const NAV = [
  { href: "/snap", label: "Snap & license" },
  { href: "/market", label: "Market" },
  { href: "/agent", label: "Agents" },
  { href: "/patterns", label: "Patterns" },
  { href: "/console", label: "Royalties" },
  { href: "/offers", label: "Offers" },
  { href: "/eval", label: "Accuracy" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} min-h-dvh flex flex-col`}>
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold">
              <Logo /> Lineage
            </Link>
            <nav aria-label="Main" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="hidden items-center gap-2 lg:flex" title="Which integrations are live">
              <span className={`pill ${mode.paypal ? "pill-good" : "pill-warn"}`}>{mode.paypal ? "PayPal sandbox" : "PayPal simulated"}</span>
              <span className={`pill ${mode.ai ? "pill-good" : "pill-warn"}`}>{mode.ai ? "Claude vision on" : "Embeddings only"}</span>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
            <span>
              Lineage · PayPal AI Hackathon 2026 · Designed &amp; built by <strong className="text-ink">Thirth Patel</strong>
            </span>
            <span className="font-mono text-xs">PayPal sandbox only. No real money moves.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
