"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Scroll reveal. Adds data-revealed="true" once the element enters the
 * viewport (IntersectionObserver, observed once). Reduced motion, or a
 * browser without IntersectionObserver, shows content immediately; the CSS
 * for .pf-reveal is also neutralised under prefers-reduced-motion.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  id,
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      const id = window.requestAnimationFrame(() => setRevealed(true));
      return () => window.cancelAnimationFrame(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style = delay ? ({ "--pf-d": `${delay}ms` } as CSSProperties) : undefined;
  return (
    <Tag ref={ref} id={id} data-revealed={revealed ? "true" : "false"} className={`pf-reveal ${className}`} style={style}>
      {children}
    </Tag>
  );
}
