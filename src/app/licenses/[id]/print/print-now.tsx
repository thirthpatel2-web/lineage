"use client";

export function PrintNow() {
  return (
    <div className="no-print mb-6 flex items-center justify-between gap-3">
      <p className="text-muted">Tags are sized for small card stock. Cut along the dashed lines.</p>
      <button className="btn" onClick={() => window.print()}>Print</button>
    </div>
  );
}
