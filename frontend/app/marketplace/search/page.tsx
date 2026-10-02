"use client";

import { Suspense } from "react";

import { MarketplaceSearch } from "@/components/marketplace/MarketplaceSearch";
import { SkeletonGrid } from "@/components/marketplace/MarketplaceParts";

export default function Page() {
  return (
    <Suspense fallback={<SkeletonGrid count={6} tall />}>
      <MarketplaceSearch />
    </Suspense>
  );
}
