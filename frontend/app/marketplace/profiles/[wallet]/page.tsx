"use client";

import { use } from "react";

import { MarketplaceProfileView } from "@/components/marketplace/MarketplaceProfileView";

export default function Page({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  return <MarketplaceProfileView wallet={decodeURIComponent(wallet)} />;
}
