"use client";

import { use } from "react";

import { MarketplaceGigForm } from "@/components/marketplace/MarketplaceGigForm";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MarketplaceGigForm gigId={id} />;
}
