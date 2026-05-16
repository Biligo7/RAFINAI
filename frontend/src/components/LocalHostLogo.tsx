export function LocalHostLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19" fill="var(--aegean)" />
      <path
        d="M7 27 L15 17 L21 22 L27 12 L33 27 Z"
        fill="var(--olive)"
        opacity="0.92"
      />
      <circle cx="27" cy="12" r="2.4" fill="var(--sand)" />
      <path
        d="M7 27 L33 27"
        stroke="var(--sand)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
