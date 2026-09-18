export function Identicon({ seed, size = 36 }: { seed: string; size?: number }) {
  const hue = 168 + ([...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 80);
  const hue2 = (hue + 56) % 360;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-hidden="true"
      className="shrink-0 rounded-full ring-2 ring-accent/15"
    >
      <rect width="36" height="36" rx="18" fill={`hsl(${hue} 42% 88%)`} />
      <circle cx="13" cy="14" r="6" fill={`hsl(${hue} 48% 36%)`} />
      <circle cx="24" cy="22" r="8" fill={`hsl(${hue2} 46% 44%)`} opacity="0.88" />
    </svg>
  );
}
