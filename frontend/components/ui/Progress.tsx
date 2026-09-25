"use client";

import { motion } from "framer-motion";

export function Progress({
  value,
  label,
  tone = "accent",
  dense = false,
}: {
  value: number;
  label?: string;
  tone?: "accent" | "gold";
  /** Tighter spacing for compact dashboard cards. */
  dense?: boolean;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? (
        <div
          className={`flex justify-between text-[11px] text-ink-faint ${
            dense ? "mb-1" : "mb-1.5 text-xs"
          }`}
        >
          <span>{label}</span>
          <span>{Math.round(width)}%</span>
        </div>
      ) : null}
      <div
        className={`overflow-hidden rounded-full bg-paper-2 ${dense ? "h-1.5" : "h-2"}`}
      >
        <motion.div
          className={`h-full rounded-full ${tone === "gold" ? "bg-gold" : "bg-accent"}`}
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
