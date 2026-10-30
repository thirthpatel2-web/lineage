"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// If the payer approved but the return redirect was lost, this finishes the capture.
export function RefreshButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button
        className="btn btn-ghost text-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/orders/${orderId}/complete`, { method: "POST" });
          const json = await res.json();
          setMessage(res.ok ? `Status: ${json.status}` : json.error);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Checking PayPal…" : "I've paid: check PayPal"}
      </button>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
    </div>
  );
}
