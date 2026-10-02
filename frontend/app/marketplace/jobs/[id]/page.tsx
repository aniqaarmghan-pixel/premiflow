"use client";

import { use } from "react";

import { MarketplaceJobDetail } from "@/components/marketplace/MarketplaceJobDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MarketplaceJobDetail jobId={id} />;
}
