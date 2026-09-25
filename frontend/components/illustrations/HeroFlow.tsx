"use client";

import { useEffect, useId, useState } from "react";

const TRACK = "M70 92 C 160 28, 250 156, 360 78 S 500 40, 530 88";

/**
 * Decorative employer → escrow → freelancer flow.
 *
 * SMIL <animateMotion> mutates SVG transforms in the browser before React
 * hydrates, which produces a server/client DOM mismatch. Particles therefore
 * render at a static rest position until after mount, then motion is attached.
 */
export function HeroFlow({
  compact = false,
  dense = false,
}: {
  compact?: boolean;
  /** Slightly shorter hero illustration for Overview density. */
  dense?: boolean;
}) {
  const raw = useId().replace(/:/g, "");
  const strokeId = `pf-hero-stroke-${raw}`;
  const softId = `pf-soft-${raw}`;
  const glowId = `pf-part-glow-${raw}`;
  const shieldId = `pf-shield-${raw}`;
  const trackId = `pf-hero-track-${raw}`;
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setMotionReady(true);
  }, []);

  const heightClass = compact
    ? "h-28"
    : dense
      ? "min-h-[140px] sm:min-h-[175px] lg:min-h-[220px]"
      : "min-h-[180px] sm:min-h-[220px] lg:min-h-[280px]";

  return (
    <div
      className={`relative overflow-hidden ${heightClass}`}
      aria-hidden={compact ? true : undefined}
    >
      {!compact ? (
        <>
          <div className="pf-glow pointer-events-none absolute -left-10 top-8 h-36 w-36 rounded-full bg-cyan/35 blur-3xl" />
          <div className="pf-glow pointer-events-none absolute right-0 bottom-0 h-40 w-40 rounded-full bg-violet/30 blur-3xl" />
        </>
      ) : null}
      <svg
        viewBox="0 0 600 220"
        className="relative h-full w-full max-w-full"
        preserveAspectRatio="xMidYMid meet"
        role={compact ? "presentation" : "img"}
        aria-label={
          compact
            ? undefined
            : "Employer funds a protected contract, work is verified, freelancer is paid"
        }
      >
        <defs>
          <linearGradient id={strokeId} x1="0" x2="1">
            <stop offset="0" stopColor="#7ff6ea" />
            <stop offset="0.5" stopColor="#6aa6ff" />
            <stop offset="1" stopColor="#b3a7ff" />
          </linearGradient>
          <filter id={softId} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={shieldId} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor="#9cbcff" />
            <stop offset="1" stopColor="#4f8cff" />
          </linearGradient>
        </defs>

        <path
          d={TRACK}
          fill="none"
          stroke={`url(#${strokeId})`}
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.28"
          filter={`url(#${softId})`}
        />
        <path
          id={trackId}
          className="pf-flow-line"
          d={TRACK}
          fill="none"
          stroke={`url(#${strokeId})`}
          strokeWidth="4.5"
          strokeDasharray="10 12"
          strokeLinecap="round"
        />

        <Particle
          className="pf-am"
          trackId={trackId}
          delay="0s"
          glow="#2ee6d6"
          core="#ffffff"
          filterId={glowId}
          motionReady={motionReady}
          restX={70}
          restY={92}
        />
        <Particle
          className="pf-am"
          trackId={trackId}
          delay="-1.05s"
          glow="#8b7bff"
          core="#f3f0ff"
          filterId={glowId}
          motionReady={motionReady}
          restX={300}
          restY={102}
        />
        <Particle
          className="pf-am"
          trackId={trackId}
          delay="-2.1s"
          glow="#4f8cff"
          core="#ffffff"
          filterId={glowId}
          motionReady={motionReady}
          restX={530}
          restY={88}
        />

        <g>
          <circle className="pf-node-ring" cx="70" cy="92" r="30" stroke="#2ee6d6" />
          <circle cx="70" cy="92" r="28" fill="#0c1b2e" stroke="#2ee6d6" strokeWidth="2" />
          <circle className="pf-node-core" cx="70" cy="92" r="8" fill="#2ee6d6" />
          <text x="70" y="142" textAnchor="middle" fill="#d5deeb" fontSize="12">
            Employer
          </text>
        </g>

        <g>
          <circle className="pf-escrow-ring" cx="300" cy="102" r="38" stroke="#7aa6ff" />
          <circle className="pf-escrow-ring pf-escrow-ring-2" cx="300" cy="102" r="42" stroke="#2ee6d6" />
          <circle
            className="pf-escrow-hit"
            cx="300"
            cy="102"
            r="34"
            fill="#0c1b2e"
            stroke="#7aa6ff"
            strokeWidth="2.2"
          />
          <g className="pf-escrow-hit">
            <path
              d="M300 84 l12 5 v12 c0 10 -8 16 -12 18 -4 -2 -12 -8 -12 -18 v-12 z"
              fill={`url(#${shieldId})`}
            />
            <path
              d="M297.2 99 v-3.2 a2.8 2.8 0 0 1 5.6 0 V99"
              fill="none"
              stroke="#07111f"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect x="295.5" y="99" width="9" height="8" rx="1.4" fill="#07111f" />
          </g>
          <text x="300" y="158" textAnchor="middle" fill="#d5deeb" fontSize="12">
            Protected contract
          </text>
        </g>

        <g>
          <circle className="pf-node-ring pf-node-ring-end" cx="530" cy="88" r="30" stroke="#8b7bff" />
          <circle cx="530" cy="88" r="28" fill="#0c1b2e" stroke="#8b7bff" strokeWidth="2" />
          <circle className="pf-node-core pf-node-core-end" cx="530" cy="88" r="8" fill="#8b7bff" />
          <text x="530" y="138" textAnchor="middle" fill="#d5deeb" fontSize="12">
            Freelancer
          </text>
        </g>
      </svg>
    </div>
  );
}

function Particle({
  trackId,
  delay,
  glow,
  core,
  filterId,
  className,
  motionReady,
  restX,
  restY,
}: {
  trackId: string;
  delay: string;
  glow: string;
  core: string;
  filterId: string;
  className?: string;
  motionReady: boolean;
  restX: number;
  restY: number;
}) {
  return (
    <g className={className} transform={motionReady ? undefined : `translate(${restX} ${restY})`}>
      <circle r="11" fill={glow} opacity="0.38" filter={`url(#${filterId})`} />
      <circle r="5.4" fill={core} />
      <circle r="3.2" fill={glow} />
      {motionReady ? (
        <animateMotion dur="3.2s" begin={delay} repeatCount="indefinite" rotate="0">
          <mpath href={`#${trackId}`} />
        </animateMotion>
      ) : null}
    </g>
  );
}
