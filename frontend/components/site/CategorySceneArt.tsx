import { useId, type ReactNode } from "react";

import { CategoryArt } from "@/components/site/CategoryArt";

/**
 * Picture-style scenes for the homepage "Browse by category" cards: layered
 * workspaces with perspective, lighting, shadows and real UI detail, drawn as
 * local inline SVG (no remote, stock or third-party artwork). Featured slugs
 * get a scene; any other slug falls back to CategoryArt. Decorative only.
 */

type P = [number, number];
type Quad = [P, P, P, P]; // top-left, top-right, bottom-right, bottom-left

/** Bilinear point inside a quad, for simple perspective surfaces. */
function bl(q: Quad, u: number, v: number): P {
  const tx = q[0][0] + (q[1][0] - q[0][0]) * u;
  const ty = q[0][1] + (q[1][1] - q[0][1]) * u;
  const bx = q[3][0] + (q[2][0] - q[3][0]) * u;
  const by = q[3][1] + (q[2][1] - q[3][1]) * u;
  return [tx + (bx - tx) * v, ty + (by - ty) * v];
}

function cell(q: Quad, u0: number, v0: number, u1: number, v1: number): string {
  return [bl(q, u0, v0), bl(q, u1, v0), bl(q, u1, v1), bl(q, u0, v1)].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function pts(q: Quad): string {
  return q.map(([x, y]) => `${x},${y}`).join(" ");
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "ui-sans-serif, system-ui, sans-serif";
const CYAN = "#2ee6d6";
const VIOLET = "#8b7cff";
const BLUE = "#47b5ff";

type Ctx = { id: string; url: (name: string) => string };

/** Shared lighting: navy backdrop, two colored glows, faint grid. */
function Backdrop({ id, url, from, to, glowA, glowB }: Ctx & { from: string; to: string; glowA: P; glowB: P }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={`${id}-ga`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={CYAN} stopOpacity="0.42" />
          <stop offset="1" stopColor={CYAN} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-gb`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={VIOLET} stopOpacity="0.45" />
          <stop offset="1" stopColor={VIOLET} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-acc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={CYAN} />
          <stop offset="1" stopColor={VIOLET} />
        </linearGradient>
        <linearGradient id={`${id}-desk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13284a" />
          <stop offset="1" stopColor="#081324" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`${id}-dots`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.8" fill="#ffffff" opacity="0.06" />
        </pattern>
        <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <rect width="400" height="300" fill={url("bg")} />
      <rect width="400" height="300" fill={url("dots")} />
      <ellipse cx={glowA[0]} cy={glowA[1]} rx="170" ry="130" fill={url("ga")} />
      <ellipse cx={glowB[0]} cy={glowB[1]} rx="160" ry="120" fill={url("gb")} />
    </>
  );
}

/** Soft contact/drop shadow. */
function Shadow({ url, x, y, w, h, o = 0.5 }: Ctx & { x: number; y: number; w: number; h: number; o?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#000" opacity={o} filter={url("blur")} />;
}

function Dots({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="2.4" fill="#ff5f57" />
      <circle cx={x + 8} cy={y} r="2.4" fill="#febc2e" />
      <circle cx={x + 16} cy={y} r="2.4" fill="#28c840" />
    </g>
  );
}

/* ------------------------------- Development ------------------------------- */
function DevelopmentScene(c: Ctx) {
  const deck: Quad = [[92, 196], [262, 184], [318, 226], [104, 246]];
  const screen: Quad = [[100, 66], [252, 54], [262, 184], [92, 196]];
  const display: Quad = [bl(screen, 0.04, 0.05), bl(screen, 0.96, 0.05), bl(screen, 0.96, 0.95), bl(screen, 0.04, 0.95)];
  const code: Array<[number, number, string]> = [
    [0.24, 0.3, VIOLET], [0.24, 0.5, CYAN], [0.3, 0.42, "#ffffff"], [0.3, 0.55, BLUE], [0.36, 0.3, CYAN],
    [0.3, 0.46, "#ffffff"], [0.24, 0.2, VIOLET], [0.3, 0.52, CYAN], [0.36, 0.38, "#f6b44b"], [0.24, 0.28, "#ffffff"],
  ];
  return (
    <>
      <Backdrop {...c} from="#061226" to="#0f2747" glowA={[170, 120]} glowB={[340, 60]} />
      <polygon points="0,214 400,198 400,300 0,300" fill={c.url("desk")} />
      <line x1="0" y1="214" x2="400" y2="198" stroke="#ffffff" strokeOpacity="0.08" />
      <Shadow {...c} x={86} y={226} w={240} h={30} o={0.6} />
      {/* laptop screen */}
      <polygon points={pts(screen)} fill="#0b1222" stroke="#2a3a5c" strokeWidth="1.5" />
      <polygon points={pts(display)} fill="#0e1a30" />
      <polygon points={cell(display, 0, 0, 0.17, 1)} fill="#0a1426" />
      {[0.12, 0.2, 0.28, 0.36].map((v) => (
        <polygon key={v} points={cell(display, 0.03, v, 0.13, v + 0.035)} fill="#ffffff" opacity="0.18" />
      ))}
      <polygon points={cell(display, 0.17, 0, 1, 0.08)} fill="#121f38" />
      <polygon points={cell(display, 0.19, 0.015, 0.36, 0.065)} fill={CYAN} opacity="0.35" />
      {code.map(([u0, len, color], i) => (
        <polygon key={i} points={cell(display, u0, 0.13 + i * 0.075, u0 + len * 0.7, 0.13 + i * 0.075 + 0.035)} fill={color} opacity={color === "#ffffff" ? 0.45 : 0.85} />
      ))}
      <polygon points={cell(display, 0.17, 0.86, 1, 1)} fill="#091224" />
      <polygon points={cell(display, 0.2, 0.9, 0.5, 0.95)} fill="#28c840" opacity="0.7" />
      <polygon points={pts(screen)} fill={c.url("glass")} />
      {/* keyboard deck */}
      <polygon points={pts(deck)} fill="#22314f" />
      <polygon points={`${deck[3][0]},${deck[3][1]} ${deck[2][0]},${deck[2][1]} ${deck[2][0]},${deck[2][1] + 5} ${deck[3][0]},${deck[3][1] + 5}`} fill="#121c30" />
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 12 }, (_, k) => (
          <polygon key={`${r}-${k}`} points={cell(deck, 0.06 + k * 0.074, 0.1 + r * 0.13, 0.06 + k * 0.074 + 0.062, 0.1 + r * 0.13 + 0.1)} fill="#0e1729" />
        ))
      )}
      <polygon points={cell(deck, 0.36, 0.66, 0.64, 0.94)} fill="#1a2742" stroke="#2f4166" strokeWidth="0.6" />
      {/* terminal */}
      <Shadow {...c} x={276} y={120} w={110} h={16} o={0.45} />
      <g transform="rotate(4 330 80)">
        <rect x="272" y="34" width="116" height="86" rx="9" fill="#0a1120" stroke="#ffffff" strokeOpacity="0.12" />
        <rect x="272" y="34" width="116" height="16" rx="9" fill="#141f36" />
        <Dots x={282} y={42} />
        <text x="281" y="64" fontFamily={MONO} fontSize="7.5" fill={CYAN}>$ npm run build</text>
        <text x="281" y="77" fontFamily={MONO} fontSize="7.5" fill="#5be37a">{"\u2713 compiled"}</text>
        <text x="281" y="90" fontFamily={MONO} fontSize="7.5" fill={VIOLET}>$ git commit -m</text>
        <rect x="281" y="98" width="6" height="9" fill="#ffffff" opacity="0.8" />
      </g>
      {/* mug */}
      <Shadow {...c} x={330} y={238} w={44} h={10} o={0.5} />
      <path d="M334 206 h32 v30 a8 8 0 0 1 -8 8 h-16 a8 8 0 0 1 -8 -8 z" fill="#1f6f8b" />
      <path d="M366 212 a9 9 0 0 1 0 18" stroke="#1f6f8b" strokeWidth="4" fill="none" />
      <ellipse cx="350" cy="206" rx="16" ry="4" fill="#3b2418" />
      <path d="M344 198 q-4 -8 2 -14 M354 196 q-4 -8 2 -14" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* badge */}
      <rect x="22" y="22" width="92" height="22" rx="11" fill="#0a1426" stroke={CYAN} strokeOpacity="0.4" />
      <circle cx="34" cy="33" r="5" fill="#28c840" />
      <text x="44" y="37" fontFamily={SANS} fontSize="9" fontWeight="700" fill="#ffffff">Build passing</text>
    </>
  );
}

/* ---------------------------------- Web3 ---------------------------------- */
function Cube({ cx, cy, s, c, tint }: { cx: number; cy: number; s: number; c: Ctx; tint: string }) {
  const w = s * 0.87;
  return (
    <g>
      <polygon points={`${cx},${cy - s / 2} ${cx + w},${cy} ${cx},${cy + s / 2} ${cx - w},${cy}`} fill={tint} opacity="0.95" />
      <polygon points={`${cx - w},${cy} ${cx},${cy + s / 2} ${cx},${cy + s * 1.5} ${cx - w},${cy + s}`} fill="#1d2a6b" />
      <polygon points={`${cx},${cy + s / 2} ${cx + w},${cy} ${cx + w},${cy + s} ${cx},${cy + s * 1.5}`} fill="#121a48" />
      <polygon points={`${cx},${cy - s / 2} ${cx + w},${cy} ${cx},${cy + s / 2} ${cx - w},${cy}`} fill={c.url("glass")} />
      <path d={`M${cx - w * 0.4} ${cy} h${w * 0.8} M${cx - w * 0.25} ${cy - s * 0.15} h${w * 0.5}`} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
    </g>
  );
}

function Web3Scene(c: Ctx) {
  const nodes: P[] = [[30, 40], [90, 20], [150, 50], [250, 20], [330, 44], [380, 110], [20, 120], [370, 200], [60, 210]];
  const links: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 6], [5, 7], [6, 8], [2, 6], [3, 5]];
  return (
    <>
      <Backdrop {...c} from="#0a0726" to="#1b1450" glowA={[200, 140]} glowB={[90, 80]} />
      {links.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke={VIOLET} strokeOpacity="0.3" strokeWidth="1" />
      ))}
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6" fill={VIOLET} opacity="0.18" />
          <circle cx={x} cy={y} r="2.4" fill={i % 2 ? CYAN : "#c3b8ff"} />
        </g>
      ))}
      {/* chain blocks */}
      <Shadow {...c} x={26} y={196} w={120} h={18} o={0.5} />
      <path d="M68 150 L104 132 M112 122 L140 108" stroke={CYAN} strokeWidth="2" strokeDasharray="3 3" />
      <Cube cx={58} cy={160} s={30} c={c} tint="#3a4bd8" />
      <Cube cx={106} cy={132} s={26} c={c} tint="#5a46e0" />
      <Cube cx={146} cy={106} s={22} c={c} tint="#2aa7c9" />
      {/* contract card */}
      <Shadow {...c} x={276} y={196} w={104} h={16} o={0.5} />
      <g transform="rotate(7 330 120)">
        <rect x="276" y="56" width="108" height="138" rx="12" fill="#0f1438" stroke={VIOLET} strokeOpacity="0.5" />
        <text x="288" y="76" fontFamily={MONO} fontSize="8" fill="#c3b8ff">contract</text>
        {[0.8, 0.6, 0.72, 0.5, 0.66, 0.42].map((w, i) => (
          <rect key={i} x={288 + (i % 3 === 1 ? 8 : 0)} y={86 + i * 12} width={78 * w} height="5" rx="2.5" fill={i % 2 ? CYAN : "#ffffff"} opacity={i % 2 ? 0.8 : 0.35} />
        ))}
        <circle cx="362" cy="174" r="17" fill={c.url("acc")} />
        <path d="M354 174 l5 5 l10 -11" stroke="#0a0726" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* wallet phone */}
      <Shadow {...c} x={168} y={246} w={100} h={16} o={0.6} />
      <g transform="rotate(-7 216 150)">
        <rect x="166" y="34" width="104" height="214" rx="20" fill="#0b0f26" stroke="#3a3f7a" strokeWidth="2" />
        <rect x="173" y="41" width="90" height="200" rx="15" fill="#141a3e" />
        <rect x="200" y="46" width="36" height="6" rx="3" fill="#0b0f26" />
        <rect x="180" y="62" width="76" height="52" rx="10" fill={c.url("acc")} />
        <rect x="180" y="62" width="76" height="52" rx="10" fill={c.url("glass")} />
        <text x="188" y="78" fontFamily={SANS} fontSize="7" fill="#0a0726" opacity="0.8">Wallet</text>
        <text x="188" y="100" fontFamily={SANS} fontSize="13" fontWeight="800" fill="#0a0726">12.40</text>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx="190" cy={132 + i * 24} r="8" fill={[CYAN, VIOLET, BLUE][i]} opacity="0.85" />
            <rect x="203" y={127 + i * 24} width="32" height="4" rx="2" fill="#ffffff" opacity="0.6" />
            <rect x="203" y={134 + i * 24} width="20" height="3.5" rx="1.75" fill="#ffffff" opacity="0.3" />
            <rect x="240" y={129 + i * 24} width="14" height="5" rx="2.5" fill="#5be37a" opacity="0.7" />
          </g>
        ))}
        <rect x="182" y="206" width="72" height="20" rx="10" fill={CYAN} />
        <text x="218" y="219" textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight="800" fill="#0a0726">Sign</text>
        <rect x="166" y="34" width="104" height="214" rx="20" fill={c.url("glass")} />
      </g>
    </>
  );
}

/* --------------------------------- Design --------------------------------- */
function DesignScene(c: Ctx) {
  const swatches = ["#0b1f3a", "#2563eb", VIOLET, CYAN, "#ff8a65"];
  return (
    <>
      <Backdrop {...c} from="#160a26" to="#2b1648" glowA={[300, 220]} glowB={[120, 60]} />
      <Shadow {...c} x={30} y={214} w={330} h={24} o={0.55} />
      {/* app window */}
      <rect x="20" y="22" width="352" height="204" rx="12" fill="#141426" stroke="#ffffff" strokeOpacity="0.1" />
      <rect x="20" y="22" width="352" height="18" rx="12" fill="#1d1d34" />
      <Dots x={31} y={31} />
      <rect x="150" y="27" width="92" height="9" rx="4.5" fill="#ffffff" opacity="0.08" />
      {/* layers panel */}
      <rect x="20" y="40" width="62" height="186" fill="#171729" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <rect x={28 + (i % 3 === 2 ? 8 : 0)} y={52 + i * 18} width="6" height="6" rx="1.5" fill={i === 1 ? VIOLET : "#ffffff"} opacity={i === 1 ? 0.9 : 0.3} />
          <rect x={38 + (i % 3 === 2 ? 8 : 0)} y={53 + i * 18} width={30 - (i % 3) * 4} height="4" rx="2" fill="#ffffff" opacity={i === 1 ? 0.8 : 0.3} />
        </g>
      ))}
      {/* canvas */}
      <rect x="82" y="40" width="232" height="186" fill="#e9ecf5" />
      {Array.from({ length: 10 }, (_, r) =>
        Array.from({ length: 13 }, (_, k) => <circle key={`${r}-${k}`} cx={90 + k * 18} cy={48 + r * 18} r="0.9" fill="#a3a9c2" />)
      )}
      {/* phone artboard */}
      <rect x="98" y="58" width="68" height="132" rx="10" fill="#ffffff" stroke="#d4d8e6" />
      <rect x="104" y="66" width="56" height="44" rx="6" fill={c.url("acc")} />
      <circle cx="120" cy="84" r="9" fill="#ffffff" opacity="0.5" />
      <rect x="104" y="118" width="44" height="5" rx="2.5" fill="#1b2140" />
      <rect x="104" y="128" width="54" height="4" rx="2" fill="#b9bfd3" />
      <rect x="104" y="136" width="40" height="4" rx="2" fill="#b9bfd3" />
      <rect x="104" y="166" width="56" height="15" rx="7.5" fill="#1b2140" />
      <rect x="94" y="54" width="76" height="140" fill="none" stroke={VIOLET} strokeWidth="1.2" strokeDasharray="3 2" />
      {[[94, 54], [170, 54], [94, 194], [170, 194]].map(([x, y], i) => (
        <rect key={i} x={x - 2.5} y={y - 2.5} width="5" height="5" fill="#ffffff" stroke={VIOLET} strokeWidth="1" />
      ))}
      <rect x="110" y="198" width="44" height="12" rx="3" fill={VIOLET} />
      <text x="132" y="207" textAnchor="middle" fontFamily={SANS} fontSize="6.5" fontWeight="700" fill="#ffffff">375 x 812</text>
      {/* desktop artboard */}
      <rect x="184" y="58" width="118" height="78" rx="6" fill="#ffffff" stroke="#d4d8e6" />
      <rect x="184" y="58" width="118" height="10" rx="6" fill="#1b2140" />
      <rect x="192" y="76" width="50" height="6" rx="3" fill="#1b2140" />
      <rect x="192" y="86" width="40" height="4" rx="2" fill="#b9bfd3" />
      <rect x="192" y="96" width="30" height="10" rx="5" fill={CYAN} />
      <rect x="250" y="74" width="44" height="36" rx="5" fill="#dfe3f2" />
      <circle cx="272" cy="92" r="9" fill={VIOLET} opacity="0.6" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={192 + i * 36} y="116" width="30" height="14" rx="3" fill="#eef0f7" stroke="#dfe3f2" />
      ))}
      {/* components row */}
      {[[188, CYAN], [222, "#1b2140"], [256, "#ffffff"]].map(([x, f], i) => (
        <rect key={i} x={x as number} y="148" width="30" height="11" rx="5.5" fill={f as string} stroke="#c9cee0" />
      ))}
      {/* cursor */}
      <path d="M232 168 l0 18 l5 -4 l4 9 l3 -1.5 l-4 -9 l6.5 -0.5 z" fill="#ffffff" stroke="#1b2140" strokeWidth="1" />
      <rect x="244" y="186" width="32" height="12" rx="6" fill="#ff7ad9" />
      <text x="260" y="194.5" textAnchor="middle" fontFamily={SANS} fontSize="7" fontWeight="700" fill="#ffffff">Maya</text>
      {/* inspector */}
      <rect x="314" y="40" width="58" height="186" fill="#171729" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="322" y={54 + i * 22} width="12" height="12" rx="3" fill={[VIOLET, CYAN, "#ff8a65"][i]} />
          <rect x="338" y={58 + i * 22} width="26" height="4" rx="2" fill="#ffffff" opacity="0.4" />
        </g>
      ))}
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x="322" y={130 + i * 18} width="42" height="3" rx="1.5" fill="#ffffff" opacity="0.15" />
          <circle cx={334 + i * 14} cy={131.5 + i * 18} r="3.5" fill="#ffffff" />
        </g>
      ))}
      {/* swatch fan */}
      <Shadow {...c} x={296} y={238} w={96} h={16} o={0.55} />
      {swatches.map((f, i) => (
        <g key={f} transform={`rotate(${-36 + i * 13} 330 250)`}>
          <rect x="320" y="160" width="22" height="94" rx="5" fill="#f5f3ee" stroke="#00000022" />
          <rect x="323" y="164" width="16" height="44" rx="3" fill={f} />
          <rect x="324" y="214" width="12" height="3" rx="1.5" fill="#9aa0b4" />
        </g>
      ))}
      <circle cx="330" cy="250" r="3" fill="#9aa0b4" />
    </>
  );
}

/* ----------------------------------- AI ----------------------------------- */
function AiScene(c: Ctx) {
  const layers: P[][] = [
    [[166, 82], [166, 112], [166, 142]],
    [[206, 70], [206, 98], [206, 126], [206, 154]],
    [[246, 96], [246, 128]],
  ];
  return (
    <>
      <Backdrop {...c} from="#03111f" to="#0b3358" glowA={[210, 112]} glowB={[330, 220]} />
      <Shadow {...c} x={70} y={216} w={300} h={22} o={0.55} />
      <rect x="64" y="34" width="318" height="188" rx="14" fill="#0b1a2e" stroke="#ffffff" strokeOpacity="0.1" />
      <rect x="64" y="34" width="318" height="20" rx="14" fill="#10243d" />
      <Dots x={76} y={44} />
      <text x="196" y="48" fontFamily={SANS} fontSize="8" fontWeight="700" fill="#cfe6ff">Model workspace</text>
      {/* chat */}
      <rect x="74" y="62" width="76" height="150" rx="9" fill="#0e2238" />
      <rect x="96" y="72" width="48" height="18" rx="8" fill={BLUE} opacity="0.8" />
      <circle cx="84" cy="102" r="6" fill={c.url("acc")} />
      <rect x="94" y="96" width="50" height="30" rx="8" fill="#ffffff" opacity="0.12" />
      <rect x="99" y="103" width="38" height="3.5" rx="1.75" fill="#ffffff" opacity="0.6" />
      <rect x="99" y="110" width="30" height="3.5" rx="1.75" fill="#ffffff" opacity="0.4" />
      <rect x="99" y="117" width="34" height="3.5" rx="1.75" fill="#ffffff" opacity="0.4" />
      <rect x="104" y="134" width="40" height="16" rx="8" fill={BLUE} opacity="0.8" />
      <rect x="80" y="194" width="64" height="12" rx="6" fill="#ffffff" opacity="0.1" />
      {/* neural graph */}
      {layers[0].flatMap((a, i) =>
        layers[1].map((b, k) => <line key={`a${i}${k}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={CYAN} strokeOpacity={0.15 + ((i + k) % 3) * 0.12} />)
      )}
      {layers[1].flatMap((a, i) =>
        layers[2].map((b, k) => <line key={`b${i}${k}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={VIOLET} strokeOpacity={0.2 + ((i + k) % 2) * 0.2} />)
      )}
      {layers.flat().map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill={i % 2 ? VIOLET : CYAN} opacity="0.18" />
          <circle cx={x} cy={y} r="4.5" fill={i % 2 ? "#c3b8ff" : "#9ff6ee"} />
        </g>
      ))}
      <rect x="160" y="176" width="96" height="30" rx="8" fill="#0e2238" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={166 + i * 6.3} y={200 - [8, 12, 10, 16, 14, 18, 15, 20, 17, 21, 19, 22, 20, 23][i]} width="3.6" height={[8, 12, 10, 16, 14, 18, 15, 20, 17, 21, 19, 22, 20, 23][i]} rx="1.5" fill={CYAN} opacity="0.7" />
      ))}
      {/* metrics */}
      <rect x="272" y="62" width="100" height="84" rx="9" fill="#0e2238" />
      <circle cx="304" cy="104" r="20" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="7" fill="none" />
      <circle cx="304" cy="104" r="20" stroke={c.url("acc")} strokeWidth="7" fill="none" strokeDasharray="110 126" strokeLinecap="round" transform="rotate(-90 304 104)" />
      <text x="304" y="107" textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight="800" fill="#ffffff">94%</text>
      <rect x="332" y="90" width="32" height="4" rx="2" fill="#ffffff" opacity="0.5" />
      <rect x="332" y="100" width="24" height="4" rx="2" fill="#ffffff" opacity="0.3" />
      <rect x="332" y="110" width="28" height="4" rx="2" fill="#ffffff" opacity="0.3" />
      <rect x="272" y="154" width="100" height="58" rx="9" fill="#0e2238" />
      <path d="M280 200 L296 186 L310 192 L326 172 L342 178 L364 162" stroke={CYAN} strokeWidth="2" fill="none" />
      {/* floating docs feeding in */}
      <Shadow {...c} x={14} y={146} w={58} h={12} o={0.5} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`rotate(${-12 + i * 5} 40 100)`}>
          <rect x={16 + i * 4} y={60 + i * 6} width="46" height="60" rx="6" fill={i === 2 ? "#f5f8fc" : "#c9d6e6"} opacity={0.6 + i * 0.2} />
          {i === 2
            ? [0, 1, 2, 3].map((k) => <rect key={k} x="30" y={80 + k * 9} width={30 - (k % 2) * 10} height="3.5" rx="1.75" fill="#3a4a62" />)
            : null}
        </g>
      ))}
      <path d="M48 46 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 z" fill="#ffffff" opacity="0.8" />
      <path d="M360 24 l1.8 4.2 l4.2 1.8 l-4.2 1.8 l-1.8 4.2 l-1.8 -4.2 l-4.2 -1.8 l4.2 -1.8 z" fill={CYAN} />
    </>
  );
}

/* ------------------------------ Video & Animation ------------------------------ */
function VideoScene(c: Ctx) {
  const tl: Quad = [[30, 180], [370, 172], [392, 262], [8, 272]];
  return (
    <>
      <Backdrop {...c} from="#120612" to="#3a1230" glowA={[250, 90]} glowB={[80, 220]} />
      <defs>
        <linearGradient id={`${c.id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b1d6e" />
          <stop offset="0.55" stopColor="#ff7a7a" />
          <stop offset="1" stopColor="#f6b44b" />
        </linearGradient>
        <radialGradient id={`${c.id}-w1`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ff7a7a" />
        </radialGradient>
        <radialGradient id={`${c.id}-w2`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor={CYAN} />
        </radialGradient>
        <radialGradient id={`${c.id}-w3`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor={VIOLET} />
        </radialGradient>
      </defs>
      {/* preview monitor */}
      <Shadow {...c} x={150} y={160} w={210} h={14} o={0.5} />
      <rect x="128" y="18" width="250" height="148" rx="10" fill="#0a0a10" stroke="#ffffff" strokeOpacity="0.12" />
      <rect x="136" y="26" width="234" height="126" rx="5" fill={c.url("sky")} />
      <circle cx="300" cy="96" r="20" fill="#ffe7a8" opacity="0.9" />
      <path d="M136 120 L186 84 L222 112 L262 76 L314 116 L370 92 L370 152 L136 152 Z" fill="#2a0f2e" opacity="0.85" />
      <path d="M136 136 L196 116 L250 132 L310 120 L370 136 L370 152 L136 152 Z" fill="#14060f" />
      <rect x="146" y="128" width="88" height="16" rx="3" fill="#000" opacity="0.55" />
      <rect x="146" y="128" width="3" height="16" fill={CYAN} />
      <rect x="154" y="133" width="60" height="5" rx="2.5" fill="#ffffff" opacity="0.85" />
      <text x="364" y="38" textAnchor="end" fontFamily={MONO} fontSize="7.5" fill="#ffffff">00:01:12:08</text>
      <rect x="146" y="34" width="216" height="110" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeDasharray="3 3" />
      {/* color wheels panel */}
      <rect x="18" y="30" width="100" height="128" rx="10" fill="#151018" stroke="#ffffff" strokeOpacity="0.1" />
      {[[42, "w1"], [94, "w2"]].map(([cx, g]) => (
        <g key={g as string}>
          <circle cx={cx as number} cy="62" r="18" fill={`url(#${c.id}-${g})`} opacity="0.9" />
          <circle cx={cx as number} cy="62" r="18" fill="none" stroke="#000" strokeOpacity="0.4" />
          <circle cx={(cx as number) + 5} cy="58" r="2.5" fill="#ffffff" stroke="#000" />
        </g>
      ))}
      <circle cx="68" cy="104" r="18" fill={`url(#${c.id}-w3)`} opacity="0.9" />
      <circle cx="64" cy="100" r="2.5" fill="#ffffff" stroke="#000" />
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x="30" y={132 + i * 11} width="76" height="3" rx="1.5" fill="#ffffff" opacity="0.15" />
          <circle cx={58 + i * 22} cy={133.5 + i * 11} r="3.5" fill="#ffffff" />
        </g>
      ))}
      {/* timeline in perspective */}
      <polygon points={pts(tl)} fill="#17121c" stroke="#ffffff" strokeOpacity="0.08" />
      {Array.from({ length: 24 }, (_, i) => (
        <polygon key={i} points={cell(tl, 0.08 + i * 0.038, 0.04, 0.08 + i * 0.038 + 0.003, i % 4 === 0 ? 0.13 : 0.09)} fill="#ffffff" opacity="0.3" />
      ))}
      {[
        [[0.08, 0.3], [0.32, 0.22], [0.56, 0.3], [0.88, 0.1]],
        [[0.1, 0.24], [0.36, 0.34], [0.72, 0.24]],
      ].map((row, r) =>
        row.map(([u, w], k) => (
          <polygon key={`${r}-${k}`} points={cell(tl, u, 0.2 + r * 0.24, u + w - 0.01, 0.38 + r * 0.24)} fill={(r + k) % 2 ? VIOLET : "#ff7a7a"} opacity="0.85" />
        ))
      )}
      {Array.from({ length: 46 }, (_, i) => {
        const h = [0.06, 0.1, 0.14, 0.08, 0.12, 0.16][i % 6];
        return <polygon key={i} points={cell(tl, 0.08 + i * 0.019, 0.84 - h, 0.08 + i * 0.019 + 0.009, 0.84)} fill={CYAN} opacity="0.65" />;
      })}
      <polygon points={cell(tl, 0.6, 0.02, 0.606, 0.96)} fill="#ff5f57" />
      <polygon points={cell(tl, 0.588, 0.0, 0.618, 0.07)} fill="#ff5f57" />
      {/* clapperboard */}
      <Shadow {...c} x={300} y={270} w={86} h={12} o={0.6} />
      <g transform="rotate(-10 340 240)">
        <rect x="302" y="222" width="78" height="50" rx="4" fill="#111" />
        <rect x="308" y="236" width="40" height="4" rx="2" fill="#ffffff" opacity="0.7" />
        <rect x="308" y="246" width="56" height="4" rx="2" fill="#ffffff" opacity="0.4" />
        <g transform="rotate(-14 302 222)">
          <rect x="302" y="208" width="78" height="14" rx="2" fill="#111" />
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon key={i} points={`${306 + i * 16},208 ${314 + i * 16},208 ${306 + i * 16},222 ${298 + i * 16},222`} fill="#ffffff" />
          ))}
        </g>
      </g>
    </>
  );
}

/* -------------------------------- Marketing -------------------------------- */
function MarketingScene(c: Ctx) {
  return (
    <>
      <Backdrop {...c} from="#041a16" to="#0f3d36" glowA={[150, 120]} glowB={[330, 80]} />
      <Shadow {...c} x={30} y={198} w={230} h={20} o={0.55} />
      <rect x="22" y="30" width="236" height="172" rx="12" fill="#0c211f" stroke="#ffffff" strokeOpacity="0.1" />
      <Dots x={34} y={42} />
      <text x="34" y="64" fontFamily={SANS} fontSize="9" fontWeight="800" fill="#ffffff">Spring launch campaign</text>
      <rect x="34" y="70" width="44" height="12" rx="6" fill={CYAN} opacity="0.2" />
      <text x="56" y="79" textAnchor="middle" fontFamily={SANS} fontSize="7" fontWeight="700" fill="#9ff6ee">Live</text>
      {/* growth chart */}
      <rect x="34" y="90" width="134" height="100" rx="8" fill="#0f2a27" />
      {[0, 1, 2, 3].map((i) => <line key={i} x1="42" x2="160" y1={104 + i * 22} y2={104 + i * 22} stroke="#ffffff" strokeOpacity="0.06" />)}
      <path d="M42 176 L60 168 L78 170 L96 152 L114 146 L132 124 L150 112 L160 100 L160 182 L42 182 Z" fill={c.url("acc")} opacity="0.25" />
      <path d="M42 176 L60 168 L78 170 L96 152 L114 146 L132 124 L150 112 L160 100" stroke={CYAN} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="160" cy="100" r="4" fill="#ffffff" stroke={CYAN} strokeWidth="2" />
      <rect x="118" y="80" width="44" height="14" rx="7" fill="#ffffff" />
      <text x="140" y="90" textAnchor="middle" fontFamily={SANS} fontSize="7.5" fontWeight="800" fill="#0c211f">+38%</text>
      {/* funnel */}
      {[78, 60, 42, 26].map((w, i) => (
        <rect key={i} x={176 + (78 - w) / 2} y={94 + i * 22} width={w} height="16" rx="4" fill={i % 2 ? VIOLET : CYAN} opacity={0.85 - i * 0.12} />
      ))}
      {/* social phone */}
      <Shadow {...c} x={262} y={238} w={110} h={16} o={0.6} />
      <g transform="rotate(8 316 140)">
        <rect x="262" y="26" width="106" height="210" rx="18" fill="#0a1311" stroke="#2c4a45" strokeWidth="2" />
        <rect x="268" y="32" width="94" height="198" rx="13" fill="#ffffff" />
        <circle cx="280" cy="46" r="6" fill={c.url("acc")} />
        <rect x="290" y="42" width="34" height="4" rx="2" fill="#1d2a28" />
        <rect x="290" y="49" width="22" height="3" rx="1.5" fill="#9fb3af" />
        <rect x="272" y="58" width="86" height="96" rx="8" fill={c.url("acc")} />
        <circle cx="300" cy="96" r="20" fill="#ffffff" opacity="0.35" />
        <path d="M272 140 L300 116 L322 132 L340 118 L358 134 L358 154 L272 154 Z" fill="#0a1311" opacity="0.35" />
        <path d="M280 172 c-4 -4 -8 0 -4 4 l4 4 l4 -4 c4 -4 0 -8 -4 -4 z" fill="#ff5f7a" />
        <rect x="290" y="171" width="20" height="4" rx="2" fill="#1d2a28" />
        <rect x="316" y="170" width="10" height="7" rx="2" fill="#9fb3af" />
        {[0, 1].map((i) => <rect key={i} x="274" y={188 + i * 9} width={70 - i * 22} height="4" rx="2" fill="#9fb3af" />)}
      </g>
      {/* megaphone */}
      <Shadow {...c} x={40} y={262} w={80} h={10} o={0.5} />
      <g transform="rotate(-14 80 240)">
        <polygon points="56,232 100,214 100,262 56,246" fill="#f6b44b" />
        <rect x="46" y="230" width="12" height="18" rx="3" fill="#e0912f" />
        <rect x="100" y="212" width="6" height="52" rx="3" fill="#ffd27a" />
        <rect x="62" y="246" width="8" height="18" rx="3" fill="#c9771f" />
        <path d="M114 226 q10 12 0 24 M122 218 q16 20 0 40" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
    </>
  );
}

/* --------------------------- Writing & Translation --------------------------- */
function WritingScene(c: Ctx) {
  return (
    <>
      <Backdrop {...c} from="#0f0f1a" to="#2a2a42" glowA={[180, 100]} glowB={[340, 200]} />
      <Shadow {...c} x={70} y={222} w={210} h={22} o={0.55} />
      <rect x="92" y="34" width="190" height="196" rx="8" fill="#ffffff" opacity="0.1" transform="rotate(-7 187 132)" />
      <rect x="88" y="30" width="190" height="196" rx="8" fill="#d9dce8" transform="rotate(4 183 128)" />
      {/* editor page */}
      <rect x="78" y="22" width="196" height="204" rx="8" fill="#fbfaf6" />
      <rect x="78" y="22" width="196" height="18" rx="8" fill="#eceae2" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={90 + i * 16} y="28" width="10" height="6" rx="2" fill="#b8b5aa" />)}
      <rect x="94" y="50" width="36" height="9" rx="4.5" fill={CYAN} opacity="0.3" />
      <text x="94" y="80" fontFamily="Georgia, ui-serif, serif" fontSize="15" fontWeight="700" fill="#151a2c">Chapter Two</text>
      <rect x="94" y="88" width="60" height="4" rx="2" fill="#a9adbd" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x="94" y={102 + i * 10} width={i === 3 ? 96 : 162} height="4.5" rx="2.25" fill="#c6c9d6" />)}
      <rect x="132" y="120" width="70" height="8" rx="2" fill={VIOLET} opacity="0.22" />
      <rect x="94" y="148" width="3" height="30" fill={CYAN} />
      {[0, 1, 2].map((i) => <rect key={i} x="104" y={150 + i * 10} width={130 - i * 26} height="5" rx="2.5" fill="#6b7186" />)}
      {[0, 1, 2].map((i) => <rect key={i} x="94" y={190 + i * 10} width={i === 2 ? 80 : 162} height="4.5" rx="2.25" fill="#c6c9d6" />)}
      {/* comment */}
      <Shadow {...c} x={210} y={130} w={70} h={10} o={0.4} />
      <rect x="206" y="96" width="74" height="40" rx="8" fill="#ffffff" stroke="#e1e3ec" />
      <circle cx="218" cy="108" r="6" fill={VIOLET} />
      <rect x="228" y="105" width="40" height="4" rx="2" fill="#4a5068" />
      <rect x="214" y="120" width="56" height="4" rx="2" fill="#c6c9d6" />
      {/* translation panel */}
      <Shadow {...c} x={276} y={184} w={104} h={14} o={0.5} />
      <g transform="rotate(5 326 130)">
        <rect x="270" y="70" width="116" height="116" rx="12" fill="#121426" stroke={VIOLET} strokeOpacity="0.5" />
        <rect x="282" y="82" width="26" height="14" rx="7" fill={CYAN} opacity="0.25" />
        <text x="295" y="92" textAnchor="middle" fontFamily={SANS} fontSize="7.5" fontWeight="800" fill="#9ff6ee">EN</text>
        <path d="M314 89 h14 m-4 -4 l4 4 l-4 4" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
        <rect x="334" y="82" width="26" height="14" rx="7" fill={VIOLET} opacity="0.3" />
        <text x="347" y="92" textAnchor="middle" fontFamily={SANS} fontSize="7.5" fontWeight="800" fill="#d4ceff">ES</text>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x="282" y={108 + i * 11} width={38 - (i % 2) * 8} height="4" rx="2" fill="#ffffff" opacity="0.45" />
            <rect x="334" y={108 + i * 11} width={40 - (i % 3) * 7} height="4" rx="2" fill="#c3b8ff" opacity="0.55" />
          </g>
        ))}
        <rect x="282" y="160" width="92" height="14" rx="7" fill={c.url("acc")} />
      </g>
      {/* language bubbles */}
      <g>
        <rect x="22" y="40" width="40" height="34" rx="10" fill={c.url("acc")} />
        <polygon points="34,74 42,74 34,82" fill={CYAN} />
        <text x="42" y="63" textAnchor="middle" fontFamily="Georgia, ui-serif, serif" fontSize="18" fontWeight="700" fill="#0f0f1a">Aa</text>
        <rect x="30" y="94" width="36" height="30" rx="9" fill="#ffffff" opacity="0.9" />
        <text x="48" y="115" textAnchor="middle" fontFamily={SANS} fontSize="14" fontWeight="700" fill="#2a2a42">{"\u00bfQ?"}</text>
      </g>
      {/* fountain pen */}
      <Shadow {...c} x={30} y={258} w={120} h={10} o={0.5} />
      <g transform="rotate(-28 90 240)">
        <rect x="30" y="234" width="104" height="13" rx="6.5" fill="#1b1f3a" />
        <rect x="96" y="234" width="6" height="13" fill="#d4b26a" />
        <rect x="44" y="231" width="40" height="3" rx="1.5" fill="#d4b26a" />
        <polygon points="134,236 154,240.5 134,245" fill="#d4b26a" />
        <line x1="138" y1="240.5" x2="150" y2="240.5" stroke="#1b1f3a" strokeWidth="0.8" />
      </g>
    </>
  );
}

/* ----------------------------- Data & Analytics ----------------------------- */
function DataScene(c: Ctx) {
  const bars = [44, 62, 38, 70, 56, 82, 64, 90];
  return (
    <>
      <Backdrop {...c} from="#03121b" to="#0d3448" glowA={[140, 110]} glowB={[330, 60]} />
      <Shadow {...c} x={30} y={200} w={240} h={20} o={0.55} />
      <rect x="18" y="40" width="252" height="168" rx="12" fill="#0b1a24" stroke="#ffffff" strokeOpacity="0.1" />
      <Dots x={30} y={52} />
      <rect x="100" y="47" width="90" height="9" rx="4.5" fill="#ffffff" opacity="0.07" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={28 + i * 80} y="66" width="72" height="34" rx="7" fill="#102532" />
          <rect x={36 + i * 80} y="73" width="30" height="4" rx="2" fill="#ffffff" opacity="0.4" />
          <text x={36 + i * 80} y="93" fontFamily={SANS} fontSize="11" fontWeight="800" fill="#ffffff">{["48.2k", "3.4%", "12.9k"][i]}</text>
          <path d={`M${76 + i * 80} 92 l6 -5 l5 2 l7 -8`} stroke={i === 1 ? VIOLET : CYAN} strokeWidth="1.6" fill="none" />
        </g>
      ))}
      <rect x="28" y="108" width="150" height="90" rx="8" fill="#102532" />
      {bars.map((h, i) => (
        <g key={i}>
          <rect x={38 + i * 17} y={190 - h * 0.85} width="6" height={h * 0.85} rx="2" fill={CYAN} opacity="0.85" />
          <rect x={45 + i * 17} y={190 - h * 0.55} width="6" height={h * 0.55} rx="2" fill={VIOLET} opacity="0.8" />
        </g>
      ))}
      <rect x="186" y="108" width="74" height="90" rx="8" fill="#102532" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x="192" y={118 + i * 15} width="30" height="4" rx="2" fill="#ffffff" opacity="0.35" />
          <rect x="230" y={118 + i * 15} width="22" height="4" rx="2" fill={i % 2 ? "#ff7a7a" : "#5be37a"} opacity="0.7" />
        </g>
      ))}
      {/* donut card */}
      <Shadow {...c} x={278} y={118} w={100} h={14} o={0.5} />
      <rect x="276" y="22" width="106" height="104" rx="12" fill="#f4f8fb" />
      <circle cx="312" cy="72" r="24" stroke="#e2e9f0" strokeWidth="10" fill="none" />
      <circle cx="312" cy="72" r="24" stroke={CYAN} strokeWidth="10" fill="none" strokeDasharray="70 151" transform="rotate(-90 312 72)" />
      <circle cx="312" cy="72" r="24" stroke={VIOLET} strokeWidth="10" fill="none" strokeDasharray="42 151" strokeDashoffset="-72" transform="rotate(-90 312 72)" />
      <circle cx="312" cy="72" r="24" stroke={BLUE} strokeWidth="10" fill="none" strokeDasharray="26 151" strokeDashoffset="-116" transform="rotate(-90 312 72)" />
      {[CYAN, VIOLET, BLUE].map((f, i) => (
        <g key={f}>
          <circle cx="348" cy={58 + i * 12} r="3" fill={f} />
          <rect x="354" y={56 + i * 12} width="20" height="4" rx="2" fill="#9aa8b8" />
        </g>
      ))}
      {/* scatter card */}
      <Shadow {...c} x={292} y={236} w={96} h={14} o={0.55} />
      <g transform="rotate(-4 336 186)">
        <rect x="288" y="140" width="98" height="92" rx="12" fill="#0e2230" stroke={CYAN} strokeOpacity="0.35" />
        {[[302, 214], [312, 204], [318, 210], [326, 196], [334, 190], [342, 194], [350, 178], [358, 174], [366, 162], [310, 192], [346, 204], [362, 186]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={i % 3 ? CYAN : VIOLET} opacity="0.85" />
        ))}
        <path d="M298 216 L372 160" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.4" strokeDasharray="4 3" />
        <rect x="298" y="150" width="40" height="5" rx="2.5" fill="#ffffff" opacity="0.5" />
      </g>
      {/* floating KPI chip */}
      <Shadow {...c} x={26} y={34} w={80} h={10} o={0.4} />
      <rect x="10" y="16" width="96" height="24" rx="12" fill={c.url("acc")} />
      <text x="58" y="31.5" textAnchor="middle" fontFamily={SANS} fontSize="8.5" fontWeight="800" fill="#03121b">SQL {"\u00b7"} 1.2M rows</text>
    </>
  );
}

const SCENES: Record<string, (c: Ctx) => ReactNode> = {
  development: DevelopmentScene,
  web3: Web3Scene,
  design: DesignScene,
  ai: AiScene,
  video: VideoScene,
  marketing: MarketingScene,
  writing: WritingScene,
  data: DataScene,
};

export function hasCategoryScene(slug: string): boolean {
  return slug in SCENES;
}

export function CategorySceneArt({ slug, className }: { slug: string; className?: string }) {
  const raw = useId();
  const id = `cs${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const Scene = SCENES[slug];
  if (!Scene) return <CategoryArt slug={slug} className={className} />;
  const ctx: Ctx = { id, url: (name: string) => `url(#${id}-${name})` };
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-category-scene={slug}
    >
      {Scene(ctx)}
    </svg>
  );
}
