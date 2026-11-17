/** The Hearth mark: an arch (the hearth) around a glowing core. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M5 28V15.5a11 11 0 0 1 22 0V28" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="16" cy="20.5" r="5" fill="currentColor" />
      <circle cx="16" cy="20.5" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
    </svg>
  );
}

export function Wordmark({ href = "#/" }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="Hearth home">
      <LogoMark />
      Hearth
    </a>
  );
}
