"use client";

import { Suspense } from "react";

import { ContractsPage } from "@/components/contracts/ContractsPage";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ContractsPage />
    </Suspense>
  );
}
