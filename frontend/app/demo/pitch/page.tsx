import type { Metadata } from "next";

import { PitchDeck } from "@/components/demo/PitchDeck";

export const metadata: Metadata = {
  title: "Pitch \u00b7 Premiflow",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function Page() {
  return <PitchDeck />;
}
