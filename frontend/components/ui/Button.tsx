"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const styles: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(135deg,#0d9488,#12c2b8_55%,#4f8cff)] text-white shadow-[0_14px_28px_-16px_rgba(18,194,184,.7)] hover:brightness-105",
  secondary:
    "bg-white text-ink border border-line hover:border-accent/40 hover:bg-card-2",
  ghost: "bg-transparent text-ink-soft hover:bg-paper-2 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
  gold: "bg-[linear-gradient(135deg,#4f8cff,#6b7cff)] text-white",
};

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"
> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({
  children,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: Props) {
  const reduceMotion = useReducedMotion();
  const still = disabled || reduceMotion;
  return (
    <motion.button
      type="button"
      whileTap={still ? undefined : { scale: 0.98 }}
      whileHover={still ? undefined : { y: -2 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm lg:min-h-10 lg:py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${
        variant === "primary" || variant === "gold" ? "pf-cta" : ""
      } ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  );
}
