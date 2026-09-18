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
      className="flex min-w-0 max-w-full flex-wrap gap-1 rounded-full border border-line bg-card p-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative min-w-0 flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm transition ${
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
                <span className="ml-1.5 text-[11px] opacity-70">{tab.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
