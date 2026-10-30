"use client";

import { useState } from "react";

export function BuyButton({ listingId, disabled }: { listingId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn btn-paypal w-full text-base"
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/checkout/item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) });
          const json = await res.json();
          if (res.ok) window.location.href = json.approveUrl;
          else {
            setError(json.error);
            setBusy(false);
          }
        }}
      >
        {disabled ? "Sold out" : busy ? "Opening PayPal…" : "Buy with PayPal"}
      </button>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}
