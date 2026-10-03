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

/**
 * Measured opaque bounds of the 512x512 PNG: x 196-315, y 200-311 (120x112,
 * centred). With `trim`, `size` is the VISIBLE artwork height: the slot hugs
 * the artwork (1px source margin) instead of reserving the transparent padding,
 * so a 58px slot shows a ~58px mark. Artwork itself is unchanged.
 */
const ART_W = 120;
const ART_H = 112;
const TRIM_SRC_H = ART_H + 2;

export function BrandMark({
  size = 36,
  light = false,
  wordmark = true,
  wordmarkFontSize,
  trim = false,
  gap: gapOverride,
}: {
  size?: number;
  light?: boolean;
  wordmark?: boolean;
  /** Optional wordmark font-size override (layout only; artwork unchanged). */
  wordmarkFontSize?: string;
  /** Size the slot to the visible artwork (size = visible mark height). */
  trim?: boolean;
  /** Optional mark-to-wordmark gap override in px. */
  gap?: number;
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
  const gap = gapOverride ?? (size >= 56 ? 12 : size >= 44 ? 14 : 12);
  // trim: render the full PNG at size*512/114 so its 112px artwork is `size` tall,
  // inside a slot exactly as big as the artwork (no transform scaling).
  const slotWidth = trim ? Math.ceil((size * (ART_W + 2)) / TRIM_SRC_H) : size;
  const imagePx = trim ? Math.round((size * MARK_INTRINSIC) / TRIM_SRC_H) : size;
  const imageScale = trim ? 1 : MARK_ZOOM;

  return (
    <span className="inline-flex items-center" style={{ gap }}>
      <span
        className="relative inline-block shrink-0 overflow-hidden"
        style={{ width: slotWidth, height: size }}
        data-brand-mark-slot=""
        aria-hidden
      >
        <Image
          src={MARK_SRC}
          alt=""
          width={MARK_INTRINSIC}
          height={MARK_INTRINSIC}
          sizes={`${Math.ceil(imagePx * imageScale)}px`}
          quality={95}
          priority
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
          style={{
            width: imagePx,
            height: imagePx,
            transform: trim
              ? "translate(-50%, -50%)"
              : `translate(-50%, -50%) scale(${MARK_ZOOM})`,
          }}
        />
      </span>
      {wordmark ? (
        <span
          className="whitespace-nowrap font-extrabold leading-none"
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
