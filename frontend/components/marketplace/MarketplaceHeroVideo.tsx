"use client";

import { useSyncExternalStore } from "react";

import {
  HERO_VIDEO_MEDIA_QUERY,
  MARKETPLACE_HERO_VIDEO,
  resolveHeroVideo,
  type HeroVideoConfig,
} from "@/lib/app/marketplace-media";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(HERO_VIDEO_MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const clientAllows = () => window.matchMedia(HERO_VIDEO_MEDIA_QUERY).matches;
// Never rendered on the server, so the video can never block first paint.
const serverAllows = () => false;

/**
 * Decorative background video. Rendered only on the client, only on md+ screens
 * and only without prefers-reduced-motion; otherwise the owned poster (when
 * configured) or the CSS aurora gradient shows.
 */
export function MarketplaceHeroVideo({ config = MARKETPLACE_HERO_VIDEO }: { config?: HeroVideoConfig | null }) {
  const allowed = useSyncExternalStore(subscribe, clientAllows, serverAllows);
  const video = resolveHeroVideo(config);
  if (!video) return null;
  if (!allowed) {
    // Small screens / reduced motion: the owned poster (if any) as a still frame.
    if (!video.poster) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={video.poster}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
      />
    );
  }
  return (
    <video
      className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-35 md:block motion-reduce:hidden"
      poster={video.poster}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src={video.src} type={video.type} />
    </video>
  );
}
