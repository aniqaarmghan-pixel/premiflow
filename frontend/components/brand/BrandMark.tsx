import { brand } from "@/lib/brand";

export function BrandMark({
  size = 36,
  light = false,
  wordmark = true,
}: {
  size?: number;
  light?: boolean;
  wordmark?: boolean;
}) {
  const id = light ? "pf-mark-light" : "pf-mark";
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#12c2b8" />
            <stop offset="1" stopColor="#6b7cff" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="12" fill={light ? "#0c1b2e" : `url(#${id})`} />
        <path
          d="M8 23 C14 10, 22 26, 29 13"
          fill="none"
          stroke={light ? `url(#${id})` : "white"}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="29" cy="13" r="2.4" fill={light ? "#2ee6d6" : "white"} />
      </svg>
      {wordmark ? (
        <span className={`text-[1.15rem] font-extrabold tracking-[-0.06em] ${light ? "text-white" : "text-ink"}`}>
          {brand.name}
        </span>
      ) : (
        <span className="sr-only">{brand.name}</span>
      )}
    </span>
  );
}
