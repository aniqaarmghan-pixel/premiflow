const EMPTY_STREAM = "M64 84 C 100 40, 180 128, 216 74";

export function EmptyArt({
  kind = "generic",
}: {
  kind?: "generic" | "wallet" | "streams" | "contracts" | "reviews" | "activity";
}) {
  const frame = "mx-auto h-52 w-full max-w-[440px]";

  if (kind === "wallet") {
    return (
      <svg viewBox="0 0 280 160" className={`${frame} pf-empty-live`} aria-hidden="true">
        <rect x="36" y="38" width="208" height="92" rx="26" fill="#e7eef8" />
        <rect x="52" y="50" width="176" height="68" rx="20" fill="#0c1b2e" />
        <rect className="pf-fixed-pulse" x="72" y="68" width="86" height="12" rx="6" fill="#2ee6d6" />
        <rect x="72" y="88" width="48" height="8" rx="4" fill="#4f8cff" opacity="0.85" />
        <circle className="pf-node-core" cx="196" cy="84" r="14" fill="#8b7bff" />
        <path
          className="pf-flow-line"
          d="M28 136 C 90 116, 190 150, 252 126"
          fill="none"
          stroke="#4f8cff"
          strokeWidth="2.5"
          strokeDasharray="5 9"
          opacity="0.7"
        />
      </svg>
    );
  }

  if (kind === "streams") {
    return (
      <svg viewBox="0 0 280 160" className={`${frame} pf-empty-live`} aria-hidden="true">
        <circle className="pf-node-ring" cx="48" cy="88" r="22" stroke="#2ee6d6" />
        <circle cx="48" cy="88" r="18" fill="#0c1b2e" stroke="#2ee6d6" strokeWidth="2" />
        <circle className="pf-node-core" cx="48" cy="88" r="6" fill="#2ee6d6" />
        <circle className="pf-escrow-ring" cx="140" cy="80" r="28" stroke="#4f8cff" />
        <circle cx="140" cy="80" r="22" fill="#0c1b2e" stroke="#4f8cff" strokeWidth="2" />
        <path
          d="M140 70 l8 3.2 v8 c0 6.5 -5 10.5 -8 12 -3 -1.5 -8 -5.5 -8 -12 v-8 z"
          fill="#4f8cff"
        />
        <circle className="pf-node-ring pf-node-ring-end" cx="232" cy="72" r="22" stroke="#8b7bff" />
        <circle cx="232" cy="72" r="18" fill="#0c1b2e" stroke="#8b7bff" strokeWidth="2" />
        <circle className="pf-node-core pf-node-core-end" cx="232" cy="72" r="6" fill="#8b7bff" />
        <path
          d={EMPTY_STREAM}
          fill="none"
          stroke="#9deee7"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          className="pf-flow-line"
          d={EMPTY_STREAM}
          fill="none"
          stroke="#12c2b8"
          strokeWidth="3.5"
          strokeDasharray="6 10"
          strokeLinecap="round"
        />
        <g className="pf-am">
          <circle r="9" fill="#8b7bff" opacity="0.4" />
          <circle r="4.8" fill="#ffffff" />
          <circle r="2.8" fill="#6b7cff" />
          <animateMotion dur="3s" repeatCount="indefinite" rotate="0" path={EMPTY_STREAM} />
        </g>
        <g className="pf-am">
          <circle r="7" fill="#2ee6d6" opacity="0.35" />
          <circle r="3.6" fill="#ffffff" />
          <animateMotion dur="3s" begin="-1.5s" repeatCount="indefinite" rotate="0" path={EMPTY_STREAM} />
        </g>
      </svg>
    );
  }

  if (kind === "reviews") {
    return (
      <svg viewBox="0 0 280 160" className={`${frame} pf-empty-live`} aria-hidden="true">
        <rect x="78" y="28" width="124" height="104" rx="22" fill="#eceefe" />
        <rect x="94" y="44" width="92" height="10" rx="5" fill="#4f8cff" opacity="0.35" />
        <rect x="94" y="62" width="64" height="8" rx="4" fill="#0c1b2e" opacity="0.25" />
        <path
          className="pf-fixed-pulse"
          d="M108 104 l16 14 36-34"
          fill="none"
          stroke="#12c2b8"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "contracts") {
    return (
      <svg viewBox="0 0 280 160" className={`${frame} pf-empty-live`} aria-hidden="true">
        <circle className="pf-escrow-ring" cx="78" cy="86" r="52" stroke="#12c2b8" />
        <rect x="28" y="44" width="100" height="84" rx="20" fill="#d7f6f3" />
        <rect x="44" y="62" width="68" height="8" rx="4" fill="#12c2b8" />
        <rect x="44" y="78" width="44" height="8" rx="4" fill="#0c1b2e" opacity="0.35" />
        <g transform="translate(68 96)">
          <g className="pf-fixed-pulse">
            <path
              d="M6 -6 v-3 a3.2 3.2 0 0 1 6.4 0 V-6"
              fill="none"
              stroke="#0c1b2e"
              strokeWidth="1.8"
            />
            <rect x="4.2" y="-6" width="10" height="9" rx="1.8" fill="#0c1b2e" />
          </g>
        </g>
        <rect x="152" y="32" width="100" height="96" rx="20" fill="#0c1b2e" />
        <rect className="pf-fixed-pulse" x="170" y="52" width="64" height="10" rx="5" fill="#2ee6d6" />
        <rect x="170" y="72" width="44" height="8" rx="4" fill="#4f8cff" opacity="0.85" />
        <rect x="170" y="90" width="52" height="8" rx="4" fill="#8b7bff" opacity="0.7" />
        <path
          className="pf-flow-line"
          d="M128 86 C 136 64, 144 108, 152 86"
          fill="none"
          stroke="#4f8cff"
          strokeWidth="3"
          strokeDasharray="4 7"
        />
      </svg>
    );
  }

  if (kind === "activity") {
    return (
      <svg viewBox="0 0 280 160" className={`${frame} pf-empty-live`} aria-hidden="true">
        <path d="M48 28 v108" stroke="#d5deeb" strokeWidth="3" />
        <circle className="pf-ms-node" cx="48" cy="48" r="9" fill="#12c2b8" />
        <circle className="pf-ms-node pf-ms-node-2" cx="48" cy="84" r="9" fill="#4f8cff" />
        <circle className="pf-ms-node pf-ms-node-3" cx="48" cy="120" r="9" fill="#8b7bff" />
        <rect x="72" y="36" width="168" height="24" rx="12" fill="#e7eef8" />
        <rect x="72" y="72" width="140" height="24" rx="12" fill="#d7f6f3" />
        <rect x="72" y="108" width="156" height="24" rx="12" fill="#eceefe" />
        <rect x="88" y="44" width="72" height="8" rx="4" fill="#4f8cff" opacity="0.45" />
        <rect x="88" y="80" width="56" height="8" rx="4" fill="#12c2b8" opacity="0.7" />
        <rect x="88" y="116" width="64" height="8" rx="4" fill="#8b7bff" opacity="0.55" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 280 160" className={`${frame} pf-empty-live`} aria-hidden="true">
      <circle className="pf-ms-node" cx="88" cy="80" r="22" fill="#12c2b8" />
      <circle className="pf-ms-node pf-ms-node-2" cx="140" cy="80" r="26" fill="#4f8cff" />
      <circle className="pf-ms-node pf-ms-node-3" cx="196" cy="80" r="22" fill="#8b7bff" />
    </svg>
  );
}
