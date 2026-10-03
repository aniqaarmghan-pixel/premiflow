/** Decorative animated gradient mesh (CSS only). Static under prefers-reduced-motion. */
export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pf-aurora pointer-events-none ${className}`}>
      <span />
      <span />
      <span />
    </div>
  );
}
