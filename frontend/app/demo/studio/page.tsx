import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoStudio } from "@/components/demo/DemoStudio";
import { demoStudioEnabled } from "@/lib/app/demo-studio";

// Read the studio gate at request time, not at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo studio \u00b7 Premiflow",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function Page() {
  if (!demoStudioEnabled()) notFound();
  return <DemoStudio />;
}
