export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-[linear-gradient(90deg,var(--paper-2),#ffffff,var(--paper-2))] bg-[length:200%_100%] ${className}`}
    />
  );
}
