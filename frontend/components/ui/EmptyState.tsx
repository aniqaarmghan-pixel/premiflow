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
    <div className="overflow-hidden rounded-[24px] border border-dashed border-line bg-[linear-gradient(180deg,#fff,#f7fafd)] px-5 py-6 text-center sm:px-6 sm:py-7">
      <div className="mx-auto max-w-xl">
        {illustration ?? <EmptyArt kind={kind} />}
        <h3 className="mt-3 font-display text-xl text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{body}</p>
        {action ? (
          <div className="mt-4">
            <Button onClick={action.onClick}>{action.label}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
