import { useId, type ReactNode } from "react";
import type { MarketplaceCategorySlug } from "@/lib/app/marketplace-categories";
import {
  gigCoverKind,
  gigCoverSeed,
  gigCoverSnippet,
  seededRandom,
  type GigCoverKind,
} from "@/lib/app/gig-cover";

/**
 * Title-specific product-mockup cover for gigs without a seller-uploaded cover.
 * Hand-built inline SVG (no remote, stock or third-party imagery). The mockup
 * kind comes from the title (then category); accent, layout and data shapes are
 * derived deterministically from the title so every listing looks distinct.
 */
const ACCENTS: ReadonlyArray<readonly [string, string]> = [
  ["#2ee6d6", "#7c8cff"],
  ["#8b7cff", "#ff7ad9"],
  ["#47b5ff", "#2ee6d6"],
  ["#f6b44b", "#ff7a7a"],
  ["#8fd94a", "#2ee6d6"],
  ["#ff8a65", "#8b7cff"],
  ["#5ec8ff", "#c77dff"],
];

const BACKDROPS: Record<GigCoverKind, readonly [string, string]> = {
  audit: ["#0a0820", "#1f1752"],
  dashboard: ["#050d1c", "#11305a"],
  mobile: ["#170a24", "#40184d"],
  video: ["#14070a", "#431526"],
  document: ["#101119", "#2b2c40"],
  campaign: ["#04180f", "#0f3d30"],
  ai: ["#03121e", "#0b3558"],
  analytics: ["#04131b", "#0e3649"],
  board: ["#0b101b", "#24324e"],
};

const SANS = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type Ctx = {
  r: () => number;
  a: string;
  b: string;
  snip: string;
  id: string;
  variant: number;
};

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function between(r: () => number, min: number, max: number): number {
  return Math.round(min + r() * (max - min));
}

function linePath(points: Array<[number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function series(r: () => number, n: number, x0: number, x1: number, yTop: number, yBottom: number): Array<[number, number]> {
  let v = 0.35 + r() * 0.3;
  return range(n).map((i) => {
    v = Math.min(0.95, Math.max(0.08, v + (r() - 0.42) * 0.3));
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    return [x, yBottom - v * (yBottom - yTop)];
  });
}

function WindowDots({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={4.5} fill="#ff5f57" />
      <circle cx={x + 15} cy={y} r={4.5} fill="#febc2e" />
      <circle cx={x + 30} cy={y} r={4.5} fill="#28c840" />
    </g>
  );
}

function Check({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={7} fill={color} opacity={0.18} />
      <path d={`M${x - 3.5} ${y} l2.4 2.6 l4.6 -5`} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/* ---------- audit: code editor with review markers and a test panel ---------- */
function Audit({ r, a, b, snip, id, variant }: Ctx) {
  const indents = [0, 1, 2, 2, 1, 2, 3, 3, 2, 1, 0];
  const flagged = new Set([between(r, 1, 4), between(r, 6, 9)]);
  const tests = ["init_escrow", "release_milestone", "refund_path", "authority_check", "overflow_guard", "close_account"];
  const offset = between(r, 0, 2);
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={40} y={44} width={variant === 2 ? 560 : 380} height={312} rx={16} fill="#0d1222" stroke="#ffffff" strokeOpacity={0.08} />
      </g>
      <rect x={40} y={44} width={variant === 2 ? 560 : 380} height={34} rx={16} fill="#121a30" />
      <rect x={40} y={64} width={variant === 2 ? 560 : 380} height={14} fill="#121a30" />
      <WindowDots x={60} y={61} />
      <rect x={110} y={52} width={72} height={26} rx={6} fill="#0d1222" />
      <text x={122} y={69} fontFamily={MONO} fontSize={11} fill="#c9d4f2">lib.rs</text>
      <text x={196} y={69} fontFamily={MONO} fontSize={11} fill="#5d6a8c">tests.rs</text>
      {range(11).map((i) => {
        const y = 100 + i * 21;
        const indent = indents[i] * 18;
        const w1 = between(r, 30, 70);
        const w2 = between(r, 40, 120);
        const w3 = between(r, 20, 60);
        return (
          <g key={i}>
            {flagged.has(i) ? <rect x={52} y={y - 13} width={(variant === 2 ? 536 : 356)} height={19} rx={4} fill={i % 2 ? "#febc2e" : a} opacity={0.12} /> : null}
            <text x={60} y={y} fontFamily={MONO} fontSize={10.5} fill="#3b4766">{i + 1 + offset * 10}</text>
            <rect x={90 + indent} y={y - 9} width={w1} height={8} rx={3} fill={b} opacity={0.9} />
            <rect x={96 + indent + w1} y={y - 9} width={w2} height={8} rx={3} fill="#c9d4f2" opacity={0.5} />
            {indent + w1 + w2 + w3 < 230 ? <rect x={102 + indent + w1 + w2} y={y - 9} width={w3} height={8} rx={3} fill={a} opacity={0.85} /> : null}
            {flagged.has(i) ? (
              i % 2 ? (
                <g>
                  <circle cx={variant === 2 ? 576 : 400} cy={y - 4} r={7} fill="#febc2e" />
                  <rect x={(variant === 2 ? 576 : 400) - 1} y={y - 8} width={2} height={5} fill="#0d1222" />
                  <rect x={(variant === 2 ? 576 : 400) - 1} y={y - 1.5} width={2} height={2} fill="#0d1222" />
                </g>
              ) : (
                <Check x={variant === 2 ? 576 : 400} y={y - 4} color="#28c840" />
              )
            ) : null}
          </g>
        );
      })}
      <text x={60} y={344} fontFamily={MONO} fontSize={10} fill="#5d6a8c">{`// review: ${snip}`.slice(0, 52)}</text>
      {variant === 2 ? (
        <g>
          <rect x={360} y={250} width={220} height={92} rx={12} fill="#141c33" stroke={a} strokeOpacity={0.4} />
          <text x={376} y={274} fontFamily={SANS} fontSize={12} fontWeight={700} fill="#ffffff">Review summary</text>
          {range(3).map((i) => (
            <g key={i}>
              <Check x={384} y={292 + i * 16} color={i === 1 ? "#febc2e" : "#28c840"} />
              <rect x={398} y={288 + i * 16} width={between(r, 80, 150)} height={7} rx={3} fill="#c9d4f2" opacity={0.45} />
            </g>
          ))}
        </g>
      ) : (
        <g filter={`url(#${id}-sh)`}>
          <rect x={436} y={76} width={168} height={250} rx={14} fill="#111830" stroke="#ffffff" strokeOpacity={0.08} />
          <path d="M458 104 l12 -6 l12 6 v10 c0 9 -6 14 -12 17 c-6 -3 -12 -8 -12 -17 z" fill={a} opacity={0.9} />
          <path d="M464 112 l4 4 l7 -8" stroke="#0d1222" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <text x={492} y={108} fontFamily={SANS} fontSize={12} fontWeight={700} fill="#ffffff">Test suite</text>
          <text x={492} y={123} fontFamily={SANS} fontSize={9.5} fill="#7d89aa">anchor test</text>
          {tests.slice(0, 5).map((t, i) => (
            <g key={t}>
              <Check x={460} y={152 + i * 28} color={i === 3 && variant === 1 ? "#febc2e" : "#28c840"} />
              <text x={474} y={156 + i * 28} fontFamily={MONO} fontSize={10} fill="#c9d4f2">{t}</text>
            </g>
          ))}
          <rect x={452} y={292} width={136} height={20} rx={10} fill="#28c840" opacity={0.16} />
          <text x={520} y={306} textAnchor="middle" fontFamily={SANS} fontSize={10} fontWeight={700} fill="#5be37a">checks passing</text>
        </g>
      )}
    </g>
  );
}

/* ---------- dashboard: browser window with KPIs and charts ---------- */
function Dashboard({ r, a, b, snip, id, variant }: Ctx) {
  const pts = series(r, 9, 186, 432, 200, 290);
  const area = `${linePath(pts)} L432 290 L186 290 Z`;
  const kpis = [`${between(r, 12, 98)}.${between(r, 1, 9)}k`, `${between(r, 61, 99)}%`, `${between(r, 2, 9)}.${between(r, 1, 9)}x`];
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={44} y={36} width={552} height={328} rx={14} fill="#f4f7fd" />
      </g>
      <rect x={44} y={36} width={552} height={32} rx={14} fill="#e3e9f5" />
      <rect x={44} y={56} width={552} height={12} fill="#e3e9f5" />
      <WindowDots x={62} y={52} />
      <rect x={120} y={43} width={300} height={18} rx={9} fill="#ffffff" />
      <text x={132} y={56} fontFamily={SANS} fontSize={10} fill="#5b6b88">{snip.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 34)}</text>
      <rect x={44} y={68} width={112} height={296} fill="#0f1a33" />
      <rect x={44} y={340} width={112} height={24} rx={0} fill="#0f1a33" />
      <circle cx={68} cy={92} r={9} fill={a} />
      <rect x={84} y={88} width={54} height={8} rx={4} fill="#ffffff" opacity={0.8} />
      {range(6).map((i) => (
        <g key={i}>
          <rect x={58} y={118 + i * 26} width={86} height={18} rx={6} fill={i === 0 ? a : "#ffffff"} opacity={i === 0 ? 0.22 : 0.04} />
          <rect x={66} y={124 + i * 26} width={between(r, 36, 62)} height={6} rx={3} fill="#ffffff" opacity={i === 0 ? 0.9 : 0.45} />
        </g>
      ))}
      <text x={172} y={94} fontFamily={SANS} fontSize={13} fontWeight={700} fill="#0f1a33">{snip}</text>
      {kpis.map((k, i) => (
        <g key={i}>
          <rect x={172 + i * 140} y={106} width={128} height={62} rx={10} fill="#ffffff" stroke="#dfe6f3" />
          <rect x={184 + i * 140} y={118} width={between(r, 40, 70)} height={6} rx={3} fill="#9aa8c3" />
          <text x={184 + i * 140} y={152} fontFamily={SANS} fontSize={20} fontWeight={800} fill="#0f1a33">{k}</text>
          <path d={linePath(series(r, 6, 250 + i * 140, 290 + i * 140, 136, 156))} stroke={i === 1 ? b : a} strokeWidth={2} fill="none" />
        </g>
      ))}
      <rect x={172} y={180} width={276} height={124} rx={10} fill="#ffffff" stroke="#dfe6f3" />
      {variant === 1 ? (
        range(10).map((i) => {
          const h = between(r, 20, 86);
          return <rect key={i} x={188 + i * 25} y={292 - h} width={14} height={h} rx={3} fill={i % 3 === 0 ? b : a} opacity={0.85} />;
        })
      ) : (
        <g>
          <path d={area} fill={`url(#${id}-acc)`} opacity={0.35} />
          <path d={linePath(pts)} stroke={a} strokeWidth={2.5} fill="none" />
          <path d={linePath(series(r, 9, 186, 432, 210, 296))} stroke={b} strokeWidth={2} strokeDasharray="5 5" fill="none" opacity={0.8} />
        </g>
      )}
      <rect x={460} y={180} width={124} height={124} rx={10} fill="#ffffff" stroke="#dfe6f3" />
      <circle cx={522} cy={236} r={34} stroke="#e6ebf5" strokeWidth={12} fill="none" />
      <circle cx={522} cy={236} r={34} stroke={a} strokeWidth={12} fill="none" strokeDasharray={`${between(r, 90, 180)} 300`} transform="rotate(-90 522 236)" />
      <rect x={490} y={284} width={64} height={6} rx={3} fill="#9aa8c3" />
      {range(2).map((i) => (
        <g key={i}>
          <rect x={172} y={314 + i * 20} width={412} height={14} rx={4} fill={i ? "#ffffff" : "#eef2fa"} />
          <rect x={182} y={318 + i * 20} width={between(r, 60, 120)} height={6} rx={3} fill="#9aa8c3" />
          <rect x={520} y={317 + i * 20} width={52} height={8} rx={4} fill={i ? b : a} opacity={0.5} />
        </g>
      ))}
    </g>
  );
}

/* ---------- mobile: phone screens with onboarding / wallet UI ---------- */
function Phone({ x, y, children, id }: { x: number; y: number; children: ReactNode; id: string }) {
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={x} y={y} width={150} height={300} rx={26} fill="#0d1124" stroke="#ffffff" strokeOpacity={0.14} strokeWidth={2} />
      </g>
      <rect x={x + 8} y={y + 8} width={134} height={284} rx={20} fill="#f6f4fb" />
      <rect x={x + 55} y={y + 14} width={40} height={8} rx={4} fill="#0d1124" />
      {children}
    </g>
  );
}

function Mobile({ r, a, b, snip, id, variant }: Ctx) {
  const words = snip.split(" ");
  const head1 = words.slice(0, 3).join(" ");
  const head2 = words.slice(3, 6).join(" ");
  const left = variant === 1 ? 150 : 96;
  return (
    <g>
      <Phone x={left} y={56} id={id}>
        <circle cx={left + 75} cy={140} r={38} fill={`url(#${id}-acc)`} />
        <path d={`M${left + 58} 140 l12 12 l22 -24`} stroke="#ffffff" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x={left + 75} y={204} textAnchor="middle" fontFamily={SANS} fontSize={11} fontWeight={800} fill="#151a33">{head1}</text>
        <text x={left + 75} y={219} textAnchor="middle" fontFamily={SANS} fontSize={11} fontWeight={800} fill="#151a33">{head2}</text>
        <rect x={left + 30} y={232} width={90} height={6} rx={3} fill="#a3a9c2" />
        <rect x={left + 40} y={244} width={70} height={6} rx={3} fill="#c3c8da" />
        <rect x={left + 20} y={300} width={110} height={30} rx={15} fill={a} />
        <text x={left + 75} y={319} textAnchor="middle" fontFamily={SANS} fontSize={10} fontWeight={700} fill="#0d1124">Connect wallet</text>
        {range(3).map((i) => (
          <circle key={i} cx={left + 63 + i * 12} cy={282} r={3} fill={i === 0 ? b : "#c3c8da"} />
        ))}
      </Phone>
      <Phone x={left + 172} y={84} id={id}>
        <rect x={left + 188} y={118} width={118} height={70} rx={12} fill={`url(#${id}-acc)`} />
        <rect x={left + 198} y={130} width={40} height={6} rx={3} fill="#ffffff" opacity={0.8} />
        <text x={left + 198} y={164} fontFamily={SANS} fontSize={17} fontWeight={800} fill="#ffffff">{`${between(r, 1, 9)},${between(r, 100, 999)}.${between(r, 10, 99)}`}</text>
        <rect x={left + 198} y={172} width={56} height={5} rx={2.5} fill="#ffffff" opacity={0.6} />
        {range(4).map((i) => (
          <g key={i}>
            <circle cx={left + 202} cy={214 + i * 30} r={10} fill={i % 2 ? b : a} opacity={0.3} />
            <rect x={left + 218} y={208 + i * 30} width={between(r, 40, 60)} height={6} rx={3} fill="#4b5270" />
            <rect x={left + 218} y={218 + i * 30} width={between(r, 24, 40)} height={5} rx={2.5} fill="#b5bbd0" />
            <rect x={left + 276} y={210 + i * 30} width={26} height={7} rx={3.5} fill={i % 2 ? "#e2566e" : "#2bb673"} opacity={0.7} />
          </g>
        ))}
      </Phone>
      {variant !== 1 ? (
        <g>
          <rect x={left + 164} y={76} width={166} height={316} rx={4} fill="none" stroke={b} strokeWidth={1.5} strokeDasharray="5 4" />
          {[[left + 164, 76], [left + 330, 76], [left + 164, 392], [left + 330, 392]].map(([cx, cy], i) => (
            <rect key={i} x={cx - 4} y={cy - 4} width={8} height={8} fill="#ffffff" stroke={b} strokeWidth={1.5} />
          ))}
          <path d={`M${left + 352} 128 l0 24 l7 -6 l5 11 l4 -2 l-5 -11 l9 -1 z`} fill="#ffffff" stroke="#0d1124" strokeWidth={1.2} />
          <rect x={left + 366} y={156} width={64} height={18} rx={9} fill={b} />
          <text x={left + 398} y={169} textAnchor="middle" fontFamily={SANS} fontSize={9.5} fontWeight={700} fill="#ffffff">Designer</text>
        </g>
      ) : (
        <g>
          <rect x={40} y={110} width={96} height={120} rx={12} fill="#ffffff" opacity={0.08} stroke="#ffffff" strokeOpacity={0.2} />
          {range(4).map((i) => (
            <g key={i}>
              <Check x={58} y={132 + i * 26} color={i < 3 ? a : "#8b93ad"} />
              <rect x={72} y={128 + i * 26} width={between(r, 36, 54)} height={7} rx={3.5} fill="#ffffff" opacity={0.6} />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

/* ---------- video: preview monitor plus edit timeline (no play glyph) ---------- */
function Video({ r, a, b, snip, id }: Ctx) {
  const playhead = between(r, 230, 470);
  const hrs = String(between(r, 0, 1)).padStart(2, "0");
  const tc = `${hrs}:${String(between(r, 0, 59)).padStart(2, "0")}:${String(between(r, 0, 59)).padStart(2, "0")}:${String(between(r, 0, 23)).padStart(2, "0")}`;
  let cx = 92;
  const clips = range(5).map(() => {
    const w = between(r, 50, 110);
    const c = { x: cx, w };
    cx += w + 4;
    return c;
  });
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={76} y={28} width={488} height={210} rx={12} fill="#0b0b10" stroke="#ffffff" strokeOpacity={0.1} />
      </g>
      <rect x={88} y={40} width={464} height={186} rx={6} fill={`url(#${id}-acc)`} opacity={0.85} />
      <path d={`M88 196 L${between(r, 150, 220)} ${between(r, 120, 150)} L${between(r, 260, 320)} 180 L${between(r, 360, 420)} ${between(r, 110, 140)} L552 190 L552 226 L88 226 Z`} fill="#0b0b10" opacity={0.55} />
      <circle cx={between(r, 380, 480)} cy={between(r, 74, 100)} r={18} fill="#ffffff" opacity={0.75} />
      <rect x={104} y={150} width={Math.min(300, 40 + snip.length * 6.2)} height={34} rx={4} fill="#0b0b10" opacity={0.75} />
      <rect x={104} y={150} width={4} height={34} fill={a} />
      <text x={116} y={172} fontFamily={SANS} fontSize={12} fontWeight={700} fill="#ffffff">{snip}</text>
      <rect x={98} y={50} width={444} height={166} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeDasharray="4 4" />
      <text x={540} y={64} textAnchor="end" fontFamily={MONO} fontSize={10.5} fill="#ffffff">{tc}</text>
      <circle cx={104} cy={62} r={4} fill="#ff5f57" />
      <text x={112} y={66} fontFamily={SANS} fontSize={9.5} fontWeight={700} fill="#ffffff">REC</text>
      <g filter={`url(#${id}-sh)`}>
        <rect x={40} y={250} width={560} height={124} rx={12} fill="#121218" stroke="#ffffff" strokeOpacity={0.08} />
      </g>
      {range(26).map((i) => (
        <rect key={i} x={92 + i * 19} y={258} width={1} height={i % 4 === 0 ? 10 : 5} fill="#5b5b70" />
      ))}
      {["V2", "V1", "A1"].map((t, i) => (
        <text key={t} x={56} y={290 + i * 28} fontFamily={MONO} fontSize={10} fill="#8a8aa0">{t}</text>
      ))}
      <rect x={between(r, 140, 260)} y={276} width={between(r, 70, 140)} height={20} rx={4} fill={b} opacity={0.75} />
      {clips.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={304} width={c.w} height={20} rx={4} fill={i % 2 ? b : a} opacity={0.85} />
          <rect x={c.x + 4} y={308} width={Math.min(18, c.w - 8)} height={12} rx={2} fill="#0b0b10" opacity={0.35} />
        </g>
      ))}
      {range(64).map((i) => {
        const h = between(r, 3, 18);
        return <rect key={i} x={92 + i * 7.6} y={344 - h / 2} width={3.4} height={h} rx={1.5} fill={a} opacity={0.55} />;
      })}
      <rect x={playhead} y={262} width={2} height={100} fill="#ff5f57" />
      <path d={`M${playhead - 6} 256 h14 l-7 8 z`} fill="#ff5f57" />
    </g>
  );
}

/* ---------- document: editorial page with TOC and comment ---------- */
function Doc({ r, a, b, snip, id, variant }: Ctx) {
  const words = snip.split(" ");
  const l1: string[] = [];
  const l2: string[] = [];
  for (const w of words) {
    if (l1.join(" ").length + w.length < 20 && l2.length === 0) l1.push(w);
    else l2.push(w);
  }
  return (
    <g>
      <rect x={176} y={40} width={320} height={340} rx={10} fill="#ffffff" opacity={0.12} transform="rotate(-4 336 210)" />
      <g filter={`url(#${id}-sh)`}>
        <rect x={168} y={26} width={320} height={348} rx={10} fill="#fbfaf7" />
      </g>
      <rect x={192} y={50} width={58} height={16} rx={8} fill={a} opacity={0.25} />
      <rect x={200} y={56} width={42} height={4} rx={2} fill="#1b2135" opacity={0.7} />
      <text x={192} y={92} fontFamily="Georgia, ui-serif, serif" fontSize={19} fontWeight={700} fill="#141a2c">{l1.join(" ")}</text>
      <text x={192} y={114} fontFamily="Georgia, ui-serif, serif" fontSize={19} fontWeight={700} fill="#141a2c">{l2.join(" ").slice(0, 24)}</text>
      <circle cx={200} cy={134} r={7} fill={b} opacity={0.6} />
      <rect x={212} y={131} width={70} height={6} rx={3} fill="#9aa1b5" />
      {range(4).map((i) => (
        <rect key={i} x={192} y={154 + i * 13} width={i === 3 ? between(r, 120, 200) : 272} height={6} rx={3} fill="#c5cad8" />
      ))}
      {variant === 1 ? (
        <g>
          <rect x={192} y={214} width={272} height={60} rx={4} fill="#f0eee6" />
          <rect x={192} y={214} width={4} height={60} fill={a} />
          <rect x={206} y={228} width={220} height={8} rx={4} fill="#6b7186" />
          <rect x={206} y={244} width={180} height={8} rx={4} fill="#6b7186" />
        </g>
      ) : (
        <g>
          <rect x={192} y={212} width={272} height={66} rx={8} fill="#141a2c" />
          {range(4).map((i) => (
            <g key={i}>
              <rect x={204 + (i % 2) * 14} y={222 + i * 13} width={between(r, 30, 60)} height={6} rx={3} fill={b} />
              <rect x={260 + (i % 2) * 14} y={222 + i * 13} width={between(r, 40, 120)} height={6} rx={3} fill={a} opacity={0.75} />
            </g>
          ))}
        </g>
      )}
      {range(5).map((i) => (
        <rect key={i} x={192} y={292 + i * 13} width={i === 4 ? between(r, 80, 180) : 272} height={6} rx={3} fill="#c5cad8" />
      ))}
      <g filter={`url(#${id}-sh)`}>
        <rect x={34} y={96} width={120} height={150} rx={12} fill="#161a2a" stroke="#ffffff" strokeOpacity={0.1} />
      </g>
      <text x={48} y={120} fontFamily={SANS} fontSize={10.5} fontWeight={700} fill="#ffffff">Contents</text>
      {range(5).map((i) => (
        <g key={i}>
          <rect x={48} y={134 + i * 20} width={3} height={10} rx={1.5} fill={i === 1 ? a : "#3a4058"} />
          <rect x={58} y={136 + i * 20} width={between(r, 50, 80)} height={6} rx={3} fill="#ffffff" opacity={i === 1 ? 0.85 : 0.35} />
        </g>
      ))}
      <g filter={`url(#${id}-sh)`}>
        <rect x={470} y={190} width={140} height={84} rx={12} fill="#ffffff" />
      </g>
      <circle cx={490} cy={210} r={9} fill={b} />
      <text x={505} y={214} fontFamily={SANS} fontSize={10} fontWeight={700} fill="#141a2c">Suggestion</text>
      <rect x={484} y={230} width={112} height={6} rx={3} fill="#c5cad8" />
      <rect x={484} y={242} width={84} height={6} rx={3} fill="#c5cad8" />
      <rect x={484} y={254} width={36} height={10} rx={5} fill={a} opacity={0.5} />
    </g>
  );
}

/* ---------- campaign: funnel, engagement chart and post cards ---------- */
function Campaign({ r, a, b, snip, id, variant }: Ctx) {
  const stages = ["Reach", "Visits", "Signups", "Active"];
  let w = 230;
  const funnel = stages.map((s) => {
    const cur = w;
    w = Math.round(w * (0.55 + r() * 0.25));
    return { s, w: cur };
  });
  const pts = series(r, 10, 60, 344, 268, 340);
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={40} y={36} width={330} height={328} rx={14} fill="#0e1d22" stroke="#ffffff" strokeOpacity={0.08} />
      </g>
      <text x={60} y={66} fontFamily={SANS} fontSize={10} fontWeight={700} fill={a}>CAMPAIGN</text>
      <text x={60} y={86} fontFamily={SANS} fontSize={13} fontWeight={700} fill="#ffffff">{snip.slice(0, 32)}</text>
      {funnel.map((f, i) => (
        <g key={f.s}>
          <rect x={60} y={104 + i * 34} width={f.w} height={24} rx={6} fill={i % 2 ? b : a} opacity={0.85 - i * 0.12} />
          <text x={70} y={120 + i * 34} fontFamily={SANS} fontSize={10.5} fontWeight={700} fill="#0b1416">{f.s}</text>
          <text x={350} y={120 + i * 34} textAnchor="end" fontFamily={MONO} fontSize={10} fill="#9fb3b8">{`${Math.round((f.w / 230) * 100)}%`}</text>
        </g>
      ))}
      <path d={`${linePath(pts)} L344 340 L60 340 Z`} fill={`url(#${id}-acc)`} opacity={0.3} />
      <path d={linePath(pts)} stroke={a} strokeWidth={2.5} fill="none" />
      {range(variant === 2 ? 1 : 2).map((i) => {
        const x = 396 + i * 22;
        const y = 50 + i * 150;
        return (
          <g key={i} filter={`url(#${id}-sh)`}>
            <rect x={x} y={y} width={196} height={variant === 2 ? 300 : 140} rx={14} fill="#ffffff" />
            <circle cx={x + 20} cy={y + 20} r={9} fill={i ? b : a} />
            <rect x={x + 36} y={y + 14} width={70} height={6} rx={3} fill="#2a3340" />
            <rect x={x + 36} y={y + 24} width={44} height={5} rx={2.5} fill="#a9b3bf" />
            <rect x={x + 12} y={y + 40} width={172} height={variant === 2 ? 190 : 64} rx={8} fill={`url(#${id}-acc)`} opacity={0.8} />
            <path d={`M${x + 20} ${y + (variant === 2 ? 254 : 124)} c-6 -6 -10 -1 -6 4 l6 6 l6 -6 c4 -5 0 -10 -6 -4 z`} fill="#ff5f7a" />
            <rect x={x + 34} y={y + (variant === 2 ? 248 : 118)} width={between(r, 20, 34)} height={6} rx={3} fill="#2a3340" />
            <rect x={x + 82} y={y + (variant === 2 ? 247 : 117)} width={14} height={9} rx={3} fill="#a9b3bf" />
            <rect x={x + 102} y={y + (variant === 2 ? 248 : 118)} width={between(r, 16, 28)} height={6} rx={3} fill="#2a3340" />
          </g>
        );
      })}
    </g>
  );
}

/* ---------- ai: retrieval workflow nodes and chat ---------- */
function Ai({ r, a, b, snip, id, variant }: Ctx) {
  const nodes: Array<[number, number, string]> = [
    [86, 120, "Docs"],
    [216, variant === 1 ? 210 : 120, "Embed"],
    [216, variant === 1 ? 90 : 230, "Index"],
    [346, 170, "Model"],
  ];
  return (
    <g>
      <path d={`M126 140 C170 140 170 ${nodes[1][1] + 20} 196 ${nodes[1][1] + 20}`} stroke={a} strokeWidth={2} strokeDasharray="6 5" fill="none" />
      <path d={`M126 140 C170 140 170 ${nodes[2][1] + 20} 196 ${nodes[2][1] + 20}`} stroke={b} strokeWidth={2} strokeDasharray="6 5" fill="none" />
      <path d={`M256 ${nodes[1][1] + 20} C300 ${nodes[1][1] + 20} 300 190 322 190`} stroke={a} strokeWidth={2} fill="none" />
      <path d={`M256 ${nodes[2][1] + 20} C300 ${nodes[2][1] + 20} 300 190 322 190`} stroke={b} strokeWidth={2} fill="none" />
      <path d="M392 190 C410 190 410 190 418 190" stroke={a} strokeWidth={2} fill="none" />
      {range(3).map((i) => (
        <rect key={i} x={60 + i * 5} y={100 + i * 6} width={46} height={56} rx={6} fill="#ffffff" opacity={0.25 + i * 0.3} />
      ))}
      {range(3).map((i) => (
        <rect key={i} x={76} y={122 + i * 9} width={between(r, 18, 28)} height={4} rx={2} fill="#203048" />
      ))}
      <text x={86} y={182} textAnchor="middle" fontFamily={SANS} fontSize={10} fontWeight={700} fill="#cfe6ff">Docs</text>
      {nodes.slice(1, 3).map(([x, y, label], k) => (
        <g key={label} filter={`url(#${id}-sh)`}>
          <rect x={x - 20} y={y} width={60} height={40} rx={10} fill="#0e2236" stroke={k ? b : a} strokeOpacity={0.7} />
          {range(9).map((i) => (
            <circle key={i} cx={x - 6 + (i % 3) * 8} cy={y + 12 + Math.floor(i / 3) * 8} r={2.2} fill={k ? b : a} opacity={0.4 + r() * 0.6} />
          ))}
          <text x={x + 10} y={y + 56} textAnchor="middle" fontFamily={SANS} fontSize={10} fontWeight={700} fill="#cfe6ff">{label}</text>
        </g>
      ))}
      <circle cx={357} cy={190} r={44} fill={a} opacity={0.12} />
      <path d="M357 158 l28 16 v32 l-28 16 l-28 -16 v-32 z" fill={`url(#${id}-acc)`} />
      {[[-12, -6], [0, -14], [12, -6], [-12, 8], [0, 14], [12, 8]].map(([dx, dy], i) => (
        <g key={i}>
          <line x1={357} y1={190} x2={357 + dx} y2={190 + dy} stroke="#ffffff" strokeWidth={1.2} opacity={0.7} />
          <circle cx={357 + dx} cy={190 + dy} r={2.5} fill="#ffffff" />
        </g>
      ))}
      <text x={357} y={252} textAnchor="middle" fontFamily={SANS} fontSize={10} fontWeight={700} fill="#cfe6ff">Model</text>
      <g filter={`url(#${id}-sh)`}>
        <rect x={420} y={60} width={190} height={280} rx={16} fill="#f5f8fc" />
      </g>
      <rect x={420} y={60} width={190} height={38} rx={16} fill="#e4ecf6" />
      <rect x={420} y={84} width={190} height={14} fill="#e4ecf6" />
      <circle cx={440} cy={79} r={8} fill={a} />
      <text x={454} y={83} fontFamily={SANS} fontSize={10} fontWeight={700} fill="#13233a">Assistant</text>
      <rect x={490} y={112} width={108} height={34} rx={12} fill={b} />
      <rect x={500} y={122} width={80} height={5} rx={2.5} fill="#ffffff" opacity={0.85} />
      <rect x={500} y={132} width={56} height={5} rx={2.5} fill="#ffffff" opacity={0.85} />
      <rect x={432} y={156} width={150} height={64} rx={12} fill="#ffffff" stroke="#dbe4ef" />
      {range(3).map((i) => (
        <rect key={i} x={442} y={168 + i * 12} width={i === 2 ? 70 : between(r, 100, 128)} height={5} rx={2.5} fill="#6d7d94" />
      ))}
      <rect x={442} y={204} width={44} height={10} rx={5} fill={a} opacity={0.35} />
      <rect x={490} y={204} width={44} height={10} rx={5} fill={a} opacity={0.35} />
      <rect x={510} y={232} width={88} height={22} rx={11} fill={b} opacity={0.9} />
      <rect x={432} y={304} width={166} height={24} rx={12} fill="#ffffff" stroke="#dbe4ef" />
      <text x={442} y={320} fontFamily={SANS} fontSize={9} fill="#8a98ad">{snip.slice(0, 26)}</text>
    </g>
  );
}

/* ---------- analytics: SQL notebook cells, chart and table ---------- */
function Analytics({ r, a, b, snip, id, variant }: Ctx) {
  const bars = range(12).map(() => between(r, 18, 90));
  const pts = bars.map((h, i): [number, number] => [92 + i * 26 + 7, 262 - h * 0.9 - between(r, 4, 20)]);
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={40} y={32} width={420} height={336} rx={14} fill="#0f1720" stroke="#ffffff" strokeOpacity={0.08} />
      </g>
      <text x={56} y={58} fontFamily={MONO} fontSize={10} fill="#5f7385">In [1]</text>
      <rect x={100} y={44} width={344} height={66} rx={8} fill="#16212c" />
      <text x={112} y={62} fontFamily={MONO} fontSize={10.5} fill={b}>SELECT</text>
      <rect x={160} y={55} width={between(r, 90, 160)} height={7} rx={3} fill="#c6d4e1" opacity={0.6} />
      <text x={112} y={80} fontFamily={MONO} fontSize={10.5} fill={b}>FROM</text>
      <rect x={148} y={73} width={between(r, 60, 120)} height={7} rx={3} fill={a} opacity={0.8} />
      <text x={112} y={98} fontFamily={MONO} fontSize={10.5} fill={b}>GROUP BY</text>
      <rect x={176} y={91} width={between(r, 40, 90)} height={7} rx={3} fill="#c6d4e1" opacity={0.6} />
      <text x={56} y={136} fontFamily={MONO} fontSize={10} fill="#5f7385">Out</text>
      <rect x={84} y={124} width={360} height={150} rx={8} fill="#121c26" />
      <text x={96} y={144} fontFamily={SANS} fontSize={11} fontWeight={700} fill="#e2ecf5">{snip.slice(0, 40)}</text>
      {bars.map((h, i) => (
        <rect key={i} x={92 + i * 26} y={262 - h * 0.9} width={14} height={h * 0.9} rx={3} fill={variant === 1 && i > 8 ? b : a} opacity={0.75} />
      ))}
      <path d={linePath(pts)} stroke={b} strokeWidth={2} fill="none" />
      {range(3).map((i) => (
        <g key={i}>
          <rect x={56} y={288 + i * 24} width={388} height={18} rx={4} fill={i % 2 ? "#121c26" : "#16212c"} />
          <rect x={66} y={294 + i * 24} width={between(r, 50, 90)} height={6} rx={3} fill="#c6d4e1" opacity={0.6} />
          <text x={300} y={301 + i * 24} fontFamily={MONO} fontSize={9.5} fill="#c6d4e1">{`${between(r, 10, 99)},${between(r, 100, 999)}`}</text>
          <text x={430} y={301 + i * 24} textAnchor="end" fontFamily={MONO} fontSize={9.5} fill={i === 1 ? "#ff7a7a" : "#5be3a0"}>{`${i === 1 ? "-" : "+"}${between(r, 1, 30)}%`}</text>
        </g>
      ))}
      <g filter={`url(#${id}-sh)`}>
        <rect x={482} y={60} width={124} height={130} rx={14} fill="#ffffff" />
      </g>
      <circle cx={544} cy={118} r={34} stroke="#e7edf4" strokeWidth={12} fill="none" />
      <circle cx={544} cy={118} r={34} stroke={a} strokeWidth={12} fill="none" strokeDasharray={`${between(r, 60, 140)} 300`} transform="rotate(-90 544 118)" />
      <circle cx={544} cy={118} r={34} stroke={b} strokeWidth={12} fill="none" strokeDasharray={`${between(r, 20, 50)} 300`} strokeDashoffset={-between(r, 145, 165)} transform="rotate(-90 544 118)" />
      <rect x={510} y={168} width={68} height={6} rx={3} fill="#9aa8b8" />
      <g filter={`url(#${id}-sh)`}>
        <rect x={482} y={210} width={124} height={92} rx={14} fill="#ffffff" />
      </g>
      <rect x={496} y={224} width={50} height={6} rx={3} fill="#9aa8b8" />
      <text x={496} y={258} fontFamily={SANS} fontSize={22} fontWeight={800} fill="#0f1720">{`${between(r, 12, 96)}.${between(r, 1, 9)}k`}</text>
      <path d={linePath(series(r, 7, 496, 592, 268, 290))} stroke={a} strokeWidth={2} fill="none" />
    </g>
  );
}

/* ---------- board: sprint kanban ---------- */
function Board({ r, a, b, snip, id, variant }: Ctx) {
  const cols = ["To do", "In progress", "Done"];
  const tags = [a, b, "#f6b44b", "#ff7a9c"];
  return (
    <g>
      <g filter={`url(#${id}-sh)`}>
        <rect x={36} y={32} width={568} height={336} rx={14} fill="#f3f5fa" />
      </g>
      <text x={56} y={64} fontFamily={SANS} fontSize={14} fontWeight={800} fill="#121a2e">{snip}</text>
      <rect x={56} y={74} width={74} height={18} rx={9} fill={a} opacity={0.25} />
      <text x={93} y={87} textAnchor="middle" fontFamily={SANS} fontSize={9.5} fontWeight={700} fill="#121a2e">{`Sprint ${between(r, 2, 14)}`}</text>
      {range(4).map((i) => (
        <circle key={i} cx={560 - i * 16} cy={62} r={10} fill={tags[i]} stroke="#f3f5fa" strokeWidth={2.5} />
      ))}
      {cols.map((c, ci) => {
        const x = 52 + ci * 186;
        const count = ci === 1 ? 3 : between(r, 2, 3);
        return (
          <g key={c}>
            <rect x={x} y={104} width={172} height={250} rx={10} fill="#e7ebf3" />
            <text x={x + 12} y={124} fontFamily={SANS} fontSize={10.5} fontWeight={700} fill="#4a5672">{c}</text>
            {range(count).map((k) => {
              const y = 136 + k * 70;
              const prog = ci === 2 ? 1 : ci === 1 ? 0.3 + r() * 0.6 : 0;
              return (
                <g key={k}>
                  <rect x={x + 10} y={y} width={152} height={60} rx={8} fill="#ffffff" stroke={ci === 1 && k === 0 && variant !== 2 ? a : "#dde3ee"} strokeWidth={ci === 1 && k === 0 && variant !== 2 ? 2 : 1} />
                  <rect x={x + 20} y={y + 10} width={34} height={8} rx={4} fill={tags[(ci + k) % 4]} opacity={0.6} />
                  <rect x={x + 20} y={y + 26} width={between(r, 80, 128)} height={6} rx={3} fill="#3c4660" />
                  {prog > 0 ? (
                    <g>
                      <rect x={x + 20} y={y + 44} width={100} height={5} rx={2.5} fill="#e3e8f1" />
                      <rect x={x + 20} y={y + 44} width={100 * prog} height={5} rx={2.5} fill={ci === 2 ? "#28c840" : a} />
                    </g>
                  ) : (
                    <rect x={x + 20} y={y + 42} width={between(r, 40, 80)} height={5} rx={2.5} fill="#b5bed0" />
                  )}
                  <circle cx={x + 146} cy={y + 46} r={7} fill={tags[(k + 2) % 4]} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

const RENDERERS: Record<GigCoverKind, (ctx: Ctx) => ReactNode> = {
  audit: Audit,
  dashboard: Dashboard,
  mobile: Mobile,
  video: Video,
  document: Doc,
  campaign: Campaign,
  ai: Ai,
  analytics: Analytics,
  board: Board,
};

export function GigCoverArt({
  title,
  category,
  seedKey,
  className,
}: {
  title: string;
  category?: MarketplaceCategorySlug | "none" | null;
  /** Extra per-listing entropy (e.g. gig id) so similar titles still differ. */
  seedKey?: string;
  className?: string;
}) {
  const rawId = useId();
  const id = `gc${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const kind = gigCoverKind(title, category ?? "none");
  const seed = gigCoverSeed(`${title}|${seedKey ?? ""}`);
  const r = seededRandom(seed);
  const [a, b] = ACCENTS[seed % ACCENTS.length];
  const [bg0, bg1] = BACKDROPS[kind];
  const ctx: Ctx = { r, a, b, snip: gigCoverSnippet(title), id, variant: (seed >>> 8) % 3 };
  const Render = RENDERERS[kind];
  const glowX = 120 + ((seed >>> 4) % 400);
  return (
    <svg
      viewBox="0 0 640 400"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${title} preview illustration`}
      className={className}
      data-cover-kind={kind}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg0} />
          <stop offset="100%" stopColor={bg1} />
        </linearGradient>
        <linearGradient id={`${id}-acc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={a} stopOpacity={0.45} />
          <stop offset="100%" stopColor={a} stopOpacity={0} />
        </radialGradient>
        <pattern id={`${id}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#ffffff" opacity="0.07" />
        </pattern>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000000" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect width="640" height="400" fill={`url(#${id}-bg)`} />
      <rect width="640" height="400" fill={`url(#${id}-dots)`} />
      <ellipse cx={glowX} cy={330} rx={300} ry={200} fill={`url(#${id}-glow)`} />
      {Render(ctx)}
    </svg>
  );
}
