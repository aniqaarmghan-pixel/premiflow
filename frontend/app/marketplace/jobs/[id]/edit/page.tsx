"use client";

import { use } from "react";

import { MarketplaceJobForm } from "@/components/marketplace/MarketplaceJobForm";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MarketplaceJobForm jobId={id} />;
}
