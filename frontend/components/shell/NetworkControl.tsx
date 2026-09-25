"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { networkMenuItems } from "@/lib/cluster";
import { NETWORK } from "@/lib/network";

/**
 * Network status control. Devnet is the active development cluster.
 * Mainnet Beta stays visible but disabled until a complete cluster bundle exists.
 */
export function NetworkControl() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = networkMenuItems();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Network"
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-card px-2.5 text-[11px] font-semibold uppercase tracking-wide text-cyan hover:border-cyan/40 sm:min-h-0 sm:py-1.5"
      >
        <Globe size={12} className="shrink-0 opacity-80" aria-hidden />
        <span>{NETWORK.label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-70" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Network"
          className="absolute right-0 z-50 mt-2 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]"
        >
          <div className="border-b border-line px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Network
            </p>
          </div>
          <div className="p-1.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={!item.selectable}
                aria-current={item.active ? "true" : undefined}
                className={`flex min-h-11 w-full items-start gap-2 rounded-xl px-3 py-2 text-left sm:min-h-10 ${
                  item.selectable
                    ? "text-ink hover:bg-paper-2"
                    : "cursor-not-allowed text-ink-faint opacity-70"
                }`}
                onClick={() => {
                  if (item.selectable) setOpen(false);
                }}
              >
                <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
                  {item.active ? <Check size={14} className="text-cyan" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-ink-soft">
                    {item.active
                      ? item.description
                      : item.configured
                        ? item.description
                        : "Not configured yet"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
