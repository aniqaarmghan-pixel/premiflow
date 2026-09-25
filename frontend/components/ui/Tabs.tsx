"use client";

import { motion } from "framer-motion";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex min-w-0 max-w-full flex-wrap gap-0.5 rounded-full border border-line bg-card/70 p-0.5"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative min-h-9 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition sm:min-h-0 sm:px-2.5 sm:py-1 ${
              active ? "text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            {active ? (
              <motion.span
                layoutId="pf-tab-pill"
                className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#0d9488,#4f8cff)]"
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : null}
            <span className="relative z-10">
              {tab.label}
              {tab.count != null ? (
                <span className="ml-1 text-[10px] opacity-70">{tab.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
