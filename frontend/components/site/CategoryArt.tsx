import { useId } from "react";

/**
 * Original inline SVG art for marketplace categories. Pure vector shapes drawn
 * for PREMIFLOW: no third-party icons, images or remote assets.
 */
type Palette = { from: string; via: string; to: string; ink: string };

const PALETTES: Record<string, Palette> = {
  development: { from: "#0b2545", via: "#13315c", to: "#12c2b8", ink: "#9ff6ee" },
  web3: { from: "#1b1145", via: "#4f3cc9", to: "#12c2b8", ink: "#c9c2ff" },
  design: { from: "#3b0d3a", via: "#a23b72", to: "#f2a65a", ink: "#ffd9b8" },
  ai: { from: "#06283d", via: "#1363df", to: "#47b5ff", ink: "#bfe3ff" },
  video: { from: "#2b0f0f", via: "#b23a48", to: "#fcb9b2", ink: "#ffe1dc" },
  marketing: { from: "#0f3d2e", via: "#1f8a70", to: "#bfdb38", ink: "#eaffb0" },
  writing: { from: "#2d2a32", via: "#5c5470", to: "#a9a4c2", ink: "#ece9f7" },
  business: { from: "#1d2b3a", via: "#3c6e71", to: "#9fc2c4", ink: "#e1f3f4" },
  none: { from: "#040a14", via: "#13315c", to: "#4f8cff", ink: "#bcd2ff" },
};

export function categoryPalette(slug: string): Palette {
  return PALETTES[slug] ?? PALETTES.none;
}

function Motif({ slug, ink }: { slug: string; ink: string }) {
  const stroke = { stroke: ink, strokeWidth: 3, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (slug) {
    case "development":
      return (
        <g {...stroke}>
          <rect x="96" y="22" width="46" height="34" rx="6" opacity="0.55" />
          <path d="M108 33l-6 6 6 6M130 33l6 6-6 6M122 30l-6 18" />
          <path d="M100 70h30M100 80h20M100 90h36" opacity="0.6" />
        </g>
      );
    case "web3":
      return (
        <g {...stroke}>
          <path d="M120 18l22 12v24l-22 12-22-12V30z" />
          <path d="M98 30l22 12 22-12M120 42v24" opacity="0.7" />
          <circle cx="120" cy="88" r="5" fill={ink} stroke="none" />
          <path d="M120 66v17" opacity="0.6" />
        </g>
      );
    case "design":
      return (
        <g {...stroke}>
          <circle cx="112" cy="44" r="20" opacity="0.6" />
          <circle cx="130" cy="58" r="20" />
          <path d="M98 92c10-14 30-14 44 0" opacity="0.7" />
        </g>
      );
    case "ai":
      return (
        <g {...stroke}>
          {[[104, 28], [136, 28], [120, 50], [100, 74], [140, 74], [120, 94]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill={ink} stroke="none" />
          ))}
          <path d="M104 28l16 22 16-22M120 50l-20 24M120 50l20 24M100 74l20 20 20-20" opacity="0.6" />
        </g>
      );
    case "video":
      return (
        <g {...stroke}>
          <rect x="94" y="26" width="52" height="38" rx="8" />
          <path d="M114 37l14 8-14 8z" fill={ink} stroke="none" />
          <path d="M94 80h52" opacity="0.5" />
          <circle cx="112" cy="80" r="4" fill={ink} stroke="none" />
        </g>
      );
    case "marketing":
      return (
        <g {...stroke}>
          <path d="M98 88l14-18 12 10 20-30" />
          <path d="M134 50h10v10" />
          <path d="M98 30h20M98 40h12" opacity="0.6" />
        </g>
      );
    case "writing":
      return (
        <g {...stroke}>
          <path d="M100 26h34M100 38h40M100 50h28" opacity="0.6" />
          <path d="M108 92l30-30 8 8-30 30h-8z" />
        </g>
      );
    case "business":
      return (
        <g {...stroke}>
          <rect x="96" y="40" width="48" height="40" rx="6" />
          <path d="M110 40v-8h20v8M96 56h48" opacity="0.7" />
          <path d="M100 96h10M116 96h24" opacity="0.5" />
        </g>
      );
    default:
      return (
        <g {...stroke}>
          <circle cx="120" cy="56" r="22" />
          <path d="M110 56l7 7 13-14" />
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
        <radialGradient id={`glow-${id}`} cx="0.8" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#bg-${id})`} />
      <rect width="160" height="120" fill={`url(#glow-${id})`} />
      <circle cx="18" cy="104" r="46" fill="#ffffff" opacity="0.06" />
      <circle cx="30" cy="22" r="10" fill="#ffffff" opacity="0.08" />
      <Motif slug={slug} ink={p.ink} />
    </svg>
  );
}
