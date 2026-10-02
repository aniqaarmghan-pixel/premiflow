"use client";

import { use } from "react";

import { MarketplaceGigDetail } from "@/components/marketplace/MarketplaceGigDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MarketplaceGigDetail gigId={id} />;
}
