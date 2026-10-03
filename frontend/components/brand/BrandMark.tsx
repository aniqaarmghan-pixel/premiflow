import Image from "next/image";

import { brand } from "@/lib/brand";

/** Approved Premiflow mark — high-res source; UI scales DOWN only. */
const MARK_SRC = "/brand/premiflow-mark.png";
const MARK_INTRINSIC = 512;

const NAVY = "#081F2A";
const CYAN = "#3BB3D0";

/**
 * Transparent padding in the approved 512² mark (~120×112 opaque content).
 * Zoom to fill the slot without editing the PNG; keep a little edge margin.
 */
const MARK_ZOOM = 512 / 136;

export function BrandMark({
  size = 36,
  light = false,
  wordmark = true,
  wordmarkFontSize,
}: {
  size?: number;
  light?: boolean;
  wordmark?: boolean;
  /** Optional wordmark font-size override (layout only; artwork unchanged). */
  wordmarkFontSize?: string;
}) {
  const wordmarkStyle =
    size >= 56
      ? { fontSize: "1.48rem", letterSpacing: "-0.02em" }
      : size >= 44
        ? { fontSize: "1.4rem", letterSpacing: "-0.02em" }
        : size >= 32
          ? { fontSize: "1.2rem", letterSpacing: "-0.02em" }
          : { fontSize: "1.15rem", letterSpacing: "-0.02em" };
  const resolvedWordmarkStyle = wordmarkFontSize
    ? { ...wordmarkStyle, fontSize: wordmarkFontSize }
    : wordmarkStyle;
  const gap = size >= 56 ? 12 : size >= 44 ? 14 : 12;

  return (
    <span className="inline-flex items-center" style={{ gap }}>
      <span
        className="relative inline-block shrink-0 overflow-hidden"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Image
          src={MARK_SRC}
          alt=""
          width={MARK_INTRINSIC}
          height={MARK_INTRINSIC}
          sizes={`${Math.ceil(size * MARK_ZOOM)}px`}
          quality={95}
          priority
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
          style={{
            width: size,
            height: size,
            transform: `translate(-50%, -50%) scale(${MARK_ZOOM})`,
          }}
        />
      </span>
      {wordmark ? (
        <span
          className="font-extrabold leading-none"
          style={resolvedWordmarkStyle}
          aria-label={brand.name}
        >
          <span style={{ color: light ? "#FFFFFF" : NAVY }}>PREMI</span>
          <span style={{ color: CYAN }}>FLOW</span>
        </span>
      ) : (
        <span className="sr-only">{brand.name}</span>
      )}
    </span>
  );
}
