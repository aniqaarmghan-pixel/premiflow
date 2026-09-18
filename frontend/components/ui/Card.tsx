"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={
        hover
          ? { y: -8, boxShadow: "0 26px 48px -22px rgba(18,194,184,.42)" }
          : undefined
      }
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-[var(--radius)] border border-line bg-card shadow-[var(--shadow)] ${className}`}
    >
      {children}
    </motion.div>
  );
}
