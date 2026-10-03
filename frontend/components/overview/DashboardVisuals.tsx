"use client";
import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/** Counts up to a real value once; renders the final value directly for reduced motion. */
export function CountUp({ value, durationMs = 700 }: { value: number; durationMs?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<{ target: number; current: number }>({ target: value, current: value });
  useEffect(() => {
    if (reduce || value <= 0) return;
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / durationMs);
      const eased = 1 - (1 - k) ** 3;
      setShown({ target: value, current: Math.round(value * eased) });
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduce]);
  const display = reduce || shown.target !== value ? value : shown.current;
  return <span className="tabular-nums">{display}</span>;
}

/** Accessible progress bar for a real percentage (0-100). */
export function ProgressBar({
  value,
  label,
  tone = "aqua",
}: {
  value: number;
  label: string;
  tone?: "aqua" | "violet";
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-paper-2"
    >
      <div
        className={`pf-progress h-full rounded-full ${
          tone === "aqua"
            ? "bg-[linear-gradient(90deg,#0d9488,#2ee6d6)]"
            : "bg-[linear-gradient(90deg,#6b5cff,#a78bfa)]"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
