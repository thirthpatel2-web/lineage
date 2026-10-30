export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="4" r="3" fill="var(--accent)" />
      <circle cx="5" cy="17" r="3" fill="var(--money)" />
      <circle cx="17" cy="17" r="3" fill="var(--money)" />
      <path d="M11 7 L5 14 M11 7 L17 14" stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="2 2.5" />
    </svg>
  );
}
