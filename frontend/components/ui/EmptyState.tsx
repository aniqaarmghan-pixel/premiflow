"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyArt } from "@/components/illustrations/EmptyArt";

export function EmptyState({
  title,
  body,
  action,
  illustration,
  kind = "generic",
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  illustration?: ReactNode;
  kind?: "generic" | "wallet" | "streams" | "contracts" | "reviews" | "activity";
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-dashed border-line bg-[linear-gradient(180deg,#fff,#f7fafd)] px-6 py-8 text-center">
      <div className="mx-auto max-w-xl">
        {illustration ?? <EmptyArt kind={kind} />}
        <h3 className="mt-4 font-display text-2xl text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{body}</p>
        {action ? (
          <div className="mt-5">
            <Button onClick={action.onClick}>{action.label}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
