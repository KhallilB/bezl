/** Dock icons; the buttons carry the accessible names. */
export function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.4 3.4l1.25 1.25M11.35 11.35l1.25 1.25M3.4 12.6l1.25-1.25M11.35 4.65l1.25-1.25" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9.75 3.75L5.5 8l4.25 4.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.25 3.75L10.5 8l-4.25 4.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ContentsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" strokeLinecap="round" />
      <circle cx="2.75" cy="4" r="0.6" fill="currentColor" />
      <circle cx="2.75" cy="8" r="0.6" fill="currentColor" />
      <circle cx="2.75" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
