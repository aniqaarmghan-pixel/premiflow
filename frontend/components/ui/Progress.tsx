"use client";

import { motion } from "framer-motion";

export function Progress({
  value,
  label,
  tone = "accent",
}: {
  value: number;
  label?: string;
  tone?: "accent" | "gold";
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex justify-between text-xs text-ink-faint">
          <span>{label}</span>
          <span>{Math.round(width)}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-paper-2">
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
