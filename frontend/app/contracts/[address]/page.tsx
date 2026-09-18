"use client";

import { use } from "react";

import { ContractDetail } from "@/components/contracts/ContractDetail";

export default function Page({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  return <ContractDetail address={address} />;
}
