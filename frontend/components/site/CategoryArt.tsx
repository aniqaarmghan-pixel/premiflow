import { useId } from "react";

/**
 * Original inline SVG art for marketplace categories. Pure vector shapes for
 * PREMIFLOW: no third-party icons or remote assets. Optional `seed` nudges the
 * motif so gig covers in the same category are not identical.
 */
type Palette = { from: string; via: string; to: string; ink: string; glow: string };

const PALETTES: Record<string, Palette> = {
  development: { from: "#061428", via: "#0d3a5c", to: "#12c2b8", ink: "#9ff6ee", glow: "#2ee6d6" },
  web3: { from: "#12082e", via: "#3a2a9e", to: "#12c2b8", ink: "#d4ceff", glow: "#8b7cff" },
  design: { from: "#2a0a28", via: "#8e2f64", to: "#f2a65a", ink: "#ffd9b8", glow: "#ff9f6b" },
  ai: { from: "#041824", via: "#0d4ea8", to: "#47b5ff", ink: "#bfe3ff", glow: "#5ec8ff" },
  video: { from: "#1a0808", via: "#8e2a36", to: "#fcb9b2", ink: "#ffe1dc", glow: "#ff7a7a" },
  marketing: { from: "#062418", via: "#157a5e", to: "#bfdb38", ink: "#eaffb0", glow: "#8fd94a" },
  writing: { from: "#1a1820", via: "#4a4460", to: "#b8b2d4", ink: "#ece9f7", glow: "#c4bdf0" },
  business: { from: "#0e1a24", via: "#2f5a5e", to: "#9fc2c4", ink: "#e1f3f4", glow: "#6ec4c8" },
  data: { from: "#071820", via: "#0e4d6e", to: "#5ec8ff", ink: "#c8ecff", glow: "#47b5ff" },
  finance: { from: "#0c1a12", via: "#1a5c3a", to: "#7dcea0", ink: "#d5f5e3", glow: "#52b788" },
  support: { from: "#1a1020", via: "#5a2d7a", to: "#e0aaff", ink: "#f3e8ff", glow: "#c77dff" },
  admin: { from: "#141820", via: "#3d4f66", to: "#a8b8cc", ink: "#e8eef5", glow: "#8899aa" },
  engineering: { from: "#1a1208", via: "#6b4a1e", to: "#e0b068", ink: "#ffe8c8", glow: "#d4a017" },
  legal: { from: "#101418", via: "#2c3e50", to: "#85929e", ink: "#d5d8dc", glow: "#7f8c8d" },
  none: { from: "#040a14", via: "#13315c", to: "#4f8cff", ink: "#bcd2ff", glow: "#4f8cff" },
};

export function categoryPalette(slug: string): Palette {
  return PALETTES[slug] ?? PALETTES.none;
}

function Motif({ slug, ink }: { slug: string; ink: string }) {
  const s = {
    stroke: ink,
    strokeWidth: 2.5,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (slug) {
    case "development":
      return (
        <g>
          <g {...s}>
            <path d="M48 38h64a6 6 0 016 6v36H42V44a6 6 0 016-6z" />
            <path d="M36 86h88l-6 10H42z" opacity="0.75" />
            <path d="M62 52l-10 12 10 12M98 52l10 12-10 12M86 48l-8 40" />
          </g>
        </g>
      );
    case "web3":
      return (
        <g {...s}>
          <path d="M78 22l18 10v20l-18 10-18-10V32z" />
          <path d="M60 32l18 10 18-10M78 42v20" opacity="0.7" />
          <path d="M104 48l16 9v18l-16 9-16-9V57z" opacity="0.85" />
          <rect x="42" y="72" width="36" height="26" rx="5" />
          <path d="M66 85h8a4 4 0 010 8h-4" opacity="0.8" />
        </g>
      );
    case "design":
      return (
        <g {...s}>
          <rect x="42" y="26" width="58" height="68" rx="6" opacity="0.9" />
          <path d="M52 40h38M52 52h28M52 64h34" opacity="0.45" />
          <circle cx="70" cy="78" r="10" opacity="0.55" />
          <path d="M108 34l22 8-28 58-10-4z" />
        </g>
      );
    case "ai":
      return (
        <g>
          <g {...s} opacity="0.75">
            <path d="M52 36l28 18 28-18M52 36v40M80 54v30M108 36v40M52 76l28 8 28-8" />
          </g>
          {[[52, 36], [80, 54], [108, 36], [52, 76], [80, 84], [108, 76], [80, 30]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill={ink} stroke="none" />
          ))}
        </g>
      );
    case "video":
      return (
        <g>
          <g {...s}>
            <rect x="46" y="38" width="68" height="44" rx="8" />
            <circle cx="80" cy="60" r="14" />
            <circle cx="80" cy="60" r="6" fill={ink} stroke="none" opacity="0.85" />
            <path d="M46 48h-10l-6-6v28l6-6h10" opacity="0.75" />
            <path d="M54 92h52" opacity="0.4" />
          </g>
          <path d="M74 54l12 6-12 6z" fill={ink} stroke="none" opacity="0.9" />
        </g>
      );
    case "marketing":
      return (
        <g {...s}>
          <path d="M44 88V32M44 88h76" opacity="0.55" />
          <path d="M56 72l18-22 14 12 28-36" />
          <path d="M106 26h14v14" />
          <rect x="52" y="74" width="10" height="14" rx="2" opacity="0.5" fill={ink} stroke="none" />
          <rect x="68" y="64" width="10" height="24" rx="2" opacity="0.55" fill={ink} stroke="none" />
          <rect x="84" y="52" width="10" height="36" rx="2" opacity="0.65" fill={ink} stroke="none" />
          <rect x="100" y="40" width="10" height="48" rx="2" opacity="0.8" fill={ink} stroke="none" />
        </g>
      );
    case "writing":
      return (
        <g {...s}>
          <path d="M50 24h48l18 18v58a6 6 0 01-6 6H50a6 6 0 01-6-6V30a6 6 0 016-6z" />
          <path d="M98 24v18h18" opacity="0.7" />
          <path d="M58 56h44M58 68h40M58 80h28" opacity="0.55" />
          <path d="M108 78l24-24 8 8-24 24h-8z" />
        </g>
      );
    case "business":
      return (
        <g {...s}>
          <rect x="44" y="46" width="72" height="48" rx="7" />
          <path d="M66 46v-10a6 6 0 016-6h16a6 6 0 016 6v10M44 66h72" opacity="0.75" />
          <rect x="74" y="62" width="12" height="10" rx="2" opacity="0.8" />
        </g>
      );
    case "data":
      return (
        <g {...s}>
          <ellipse cx="80" cy="36" rx="28" ry="10" />
          <path d="M52 36v28c0 6 12 10 28 10s28-4 28-10V36" />
          <path d="M52 50c0 6 12 10 28 10s28-4 28-10M52 64c0 6 12 10 28 10s28-4 28-10" opacity="0.7" />
          <path d="M44 88l12-16 10 8 14-20 10 12 16-18" opacity="0.85" />
        </g>
      );
    case "finance":
      return (
        <g {...s}>
          <rect x="50" y="28" width="60" height="64" rx="8" />
          <path d="M70 48h20M70 60h20M70 72h12" opacity="0.5" />
          <circle cx="80" cy="44" r="10" />
          <path d="M80 38v12M76 42h8" />
          <path d="M44 88h72" opacity="0.4" />
        </g>
      );
    case "support":
      return (
        <g {...s}>
          <path d="M48 52a32 32 0 0164 0v12a12 12 0 01-12 12h-8l-12 14v-14H60a12 12 0 01-12-12z" />
          <circle cx="68" cy="56" r="3" fill={ink} stroke="none" />
          <circle cx="80" cy="56" r="3" fill={ink} stroke="none" />
          <circle cx="92" cy="56" r="3" fill={ink} stroke="none" />
        </g>
      );
    case "admin":
      return (
        <g {...s}>
          <rect x="46" y="30" width="68" height="52" rx="6" />
          <path d="M56 44h48M56 56h36M56 68h40" opacity="0.55" />
          <rect x="100" y="74" width="22" height="18" rx="3" opacity="0.85" />
          <path d="M106 80h10M106 86h6" opacity="0.6" />
          <circle cx="58" cy="88" r="6" opacity="0.7" />
        </g>
      );
    case "engineering":
      return (
        <g {...s}>
          <circle cx="80" cy="56" r="22" />
          <circle cx="80" cy="56" r="10" opacity="0.7" />
          <path d="M80 28v8M80 76v8M52 56h8M100 56h8M60 36l6 6M94 70l6 6M60 76l6-6M94 42l6-6" />
          <rect x="108" y="70" width="20" height="14" rx="2" opacity="0.75" />
        </g>
      );
    case "legal":
      return (
        <g {...s}>
          <path d="M80 24v16M60 40h40" />
          <path d="M52 48c0 20 12 36 28 44 16-8 28-24 28-44" opacity="0.85" />
          <path d="M68 56h24M68 66h24M68 76h16" opacity="0.5" />
          <path d="M44 96h72" opacity="0.4" />
        </g>
      );
    default:
      return (
        <g {...s}>
          <circle cx="80" cy="56" r="26" />
          <path d="M68 56l8 8 16-16" />
        </g>
      );
  }
}

const SEED_NUDGE: Array<{ x: number; y: number; s: number }> = [
  { x: 0, y: 0, s: 1 },
  { x: 6, y: -4, s: 1.05 },
  { x: -8, y: 2, s: 0.95 },
  { x: 4, y: 6, s: 1.08 },
  { x: -5, y: -6, s: 0.92 },
  { x: 10, y: 0, s: 1.02 },
  { x: -10, y: 4, s: 0.98 },
  { x: 2, y: -8, s: 1.1 },
  { x: -3, y: 8, s: 0.9 },
  { x: 8, y: 5, s: 1.04 },
  { x: -6, y: -2, s: 0.96 },
  { x: 0, y: 4, s: 1.06 },
];

export function CategoryArt({
  slug,
  className = "",
  seed = 0,
}: {
  slug: string;
  className?: string;
  /** 0–11 nudge so same-category covers vary by title. */
  seed?: number;
}) {
  const id = useId().replace(/:/g, "");
  const p = categoryPalette(slug);
  const nudge = SEED_NUDGE[Math.abs(seed) % SEED_NUDGE.length] ?? SEED_NUDGE[0];
  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.from} />
          <stop offset="0.55" stopColor={p.via} />
          <stop offset="1" stopColor={p.to} />
        </linearGradient>
        <radialGradient id={`glow-${id}`} cx="0.75" cy="0.2" r="0.75">
          <stop offset="0" stopColor={p.glow} stopOpacity="0.45" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`soft-${id}`} cx="0.25" cy="0.85" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#bg-${id})`} />
      <rect width="160" height="120" fill={`url(#glow-${id})`} />
      <rect width="160" height="120" fill={`url(#soft-${id})`} />
      <circle cx="20" cy="100" r="42" fill="#ffffff" opacity="0.05" />
      <g transform={`translate(${80 + nudge.x} ${60 + nudge.y}) scale(${nudge.s}) translate(-80 -60)`}>
        <Motif slug={slug} ink={p.ink} />
      </g>
    </svg>
  );
}
