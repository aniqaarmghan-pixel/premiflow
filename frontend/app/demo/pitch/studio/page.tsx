import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PitchDeck } from "@/components/demo/PitchDeck";
import { demoStudioEnabled } from "@/lib/app/demo-studio";
import { findPitchScreenshots } from "@/lib/app/pitch-screenshots-server";

// Read the studio gate (and any newly added screenshots) at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pitch studio \u00b7 Premiflow",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function Page() {
  if (!demoStudioEnabled()) notFound();
  return <PitchDeck studio screenshots={findPitchScreenshots()} />;
}
