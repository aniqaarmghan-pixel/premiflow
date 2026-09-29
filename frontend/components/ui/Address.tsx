"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { explorerAddressUrl, shortenAddress } from "@/lib/network";

export function Address({
  value,
  label,
  href,
}: {
  value: string;
  label?: string;
  /** Explorer link override (e.g. a transaction URL); defaults to the address page. */
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {label ? <span className="text-xs text-ink-faint">{label}</span> : null}
      <a
        href={href ?? explorerAddressUrl(value)}
        target="_blank"
        rel="noreferrer"
        className="truncate font-mono text-xs text-ink-soft hover:text-ink"
        title={value}
      >
        {shortenAddress(value)}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy address"
        className="rounded-full p-1 text-ink-faint hover:bg-paper-2 hover:text-ink"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
