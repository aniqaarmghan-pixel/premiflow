export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "gold" | "danger" | "ok";
}) {
  const tones = {
    neutral: "bg-paper-2 text-ink-soft",
    accent: "bg-accent-soft text-accent",
    gold: "bg-gold-soft text-gold",
    danger: "bg-danger-soft text-danger",
    ok: "bg-[#dcefe6] text-ok",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors duration-300 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
