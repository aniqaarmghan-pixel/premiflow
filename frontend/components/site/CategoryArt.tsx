import { useId } from "react";

/**
 * Original inline SVG art for marketplace categories. Pure vector shapes drawn
 * for PREMIFLOW: no third-party icons, images or remote assets. Each motif is
 * title-related (code, wallet, pen, neural net, camera, chart, document, briefcase).
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
      // Laptop + code brackets
      return (
        <g>
          <g {...s}>
            <path d="M48 38h64a6 6 0 016 6v36H42V44a6 6 0 016-6z" opacity="0.95" />
            <path d="M36 86h88l-6 10H42z" opacity="0.75" />
            <path d="M62 52l-10 12 10 12M98 52l10 12-10 12M86 48l-8 40" />
          </g>
          <circle cx="128" cy="28" r="3" fill={ink} opacity="0.55" />
          <circle cx="40" cy="24" r="2" fill={ink} opacity="0.4" />
        </g>
      );
    case "web3":
      // Hex chain + wallet
      return (
        <g>
          <g {...s}>
            <path d="M78 22l18 10v20l-18 10-18-10V32z" />
            <path d="M60 32l18 10 18-10M78 42v20" opacity="0.7" />
            <path d="M104 48l16 9v18l-16 9-16-9V57z" opacity="0.85" />
            <path d="M88 57l16 9 16-9M104 66v18" opacity="0.55" />
            <rect x="42" y="72" width="36" height="26" rx="5" />
            <path d="M66 85h8a4 4 0 010 8h-4" opacity="0.8" />
            <circle cx="52" cy="85" r="2.5" fill={ink} stroke="none" />
          </g>
        </g>
      );
    case "design":
      // Artboard + pen tool
      return (
        <g>
          <g {...s}>
            <rect x="42" y="26" width="58" height="68" rx="6" opacity="0.9" />
            <path d="M52 40h38M52 52h28M52 64h34" opacity="0.45" />
            <circle cx="70" cy="78" r="10" opacity="0.55" />
            <path d="M108 34l22 8-28 58-10-4z" />
            <path d="M108 34l6 14" opacity="0.7" />
            <circle cx="130" cy="42" r="3" fill={ink} stroke="none" />
          </g>
        </g>
      );
    case "ai":
      // Neural network nodes
      return (
        <g>
          <g {...s} opacity="0.75">
            <path d="M52 36l28 18 28-18M52 36l0 40M80 54l0 30M108 36l0 40M52 76l28 8 28-8M52 36l56 0M52 76l56 0" />
          </g>
          {[
            [52, 36],
            [80, 54],
            [108, 36],
            [52, 76],
            [80, 84],
            [108, 76],
            [80, 30],
            [66, 58],
            [94, 58],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill={ink} stroke="none" opacity="0.95" />
          ))}
        </g>
      );
    case "video":
      // Camera body + play + film strip
      return (
        <g>
          <g {...s}>
            <rect x="46" y="38" width="68" height="44" rx="8" />
            <circle cx="80" cy="60" r="14" />
            <circle cx="80" cy="60" r="6" fill={ink} stroke="none" opacity="0.85" />
            <path d="M46 48h-10l-6-6v28l6-6h10" opacity="0.75" />
            <path d="M118 48h12v8h-4v8h4v8h-12" opacity="0.55" />
            <path d="M54 92h12M72 92h8M86 92h20" opacity="0.4" />
          </g>
          <path d="M74 54l12 6-12 6z" fill={ink} stroke="none" opacity="0.9" />
        </g>
      );
    case "marketing":
      // Growth chart + bars
      return (
        <g>
          <g {...s}>
            <path d="M44 88V32M44 88h76" opacity="0.55" />
            <path d="M56 72l18-22 14 12 28-36" />
            <path d="M106 26h14v14" />
            <rect x="52" y="74" width="10" height="14" rx="2" opacity="0.5" fill={ink} stroke="none" />
            <rect x="68" y="64" width="10" height="24" rx="2" opacity="0.55" fill={ink} stroke="none" />
            <rect x="84" y="52" width="10" height="36" rx="2" opacity="0.65" fill={ink} stroke="none" />
            <rect x="100" y="40" width="10" height="48" rx="2" opacity="0.8" fill={ink} stroke="none" />
          </g>
        </g>
      );
    case "writing":
      // Document + article lines + pen tip
      return (
        <g>
          <g {...s}>
            <path d="M50 24h48l18 18v58a6 6 0 01-6 6H50a6 6 0 01-6-6V30a6 6 0 016-6z" />
            <path d="M98 24v18h18" opacity="0.7" />
            <path d="M58 56h44M58 68h40M58 80h28" opacity="0.55" />
            <path d="M108 78l24-24 8 8-24 24h-8z" />
            <path d="M108 78l6 6" opacity="0.7" />
          </g>
        </g>
      );
    case "business":
      // Briefcase + strategy nodes
      return (
        <g>
          <g {...s}>
            <rect x="44" y="46" width="72" height="48" rx="7" />
            <path d="M66 46v-10a6 6 0 016-6h16a6 6 0 016 6v10M44 66h72" opacity="0.75" />
            <rect x="74" y="62" width="12" height="10" rx="2" opacity="0.8" />
            <circle cx="52" cy="32" r="4" fill={ink} stroke="none" opacity="0.7" />
            <circle cx="80" cy="24" r="4" fill={ink} stroke="none" opacity="0.55" />
            <circle cx="112" cy="34" r="4" fill={ink} stroke="none" opacity="0.7" />
            <path d="M52 32l28-8 32 10" opacity="0.45" />
          </g>
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

export function CategoryArt({ slug, className = "" }: { slug: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const p = categoryPalette(slug);
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
      <Motif slug={slug} ink={p.ink} />
    </svg>
  );
}
