const STREAM = "M18 62 C48 18, 92 86, 162 36";

export function TypeMotif({
  type,
  active = false,
}: {
  type: "Fixed" | "Milestone" | "Streaming";
  active?: boolean;
}) {
  const live = active ? "pf-motif-live" : "";

  if (type === "Fixed") {
    return (
      <svg viewBox="0 0 180 100" className={`h-24 w-full ${live}`} aria-hidden="true">
        <rect x="24" y="22" width="132" height="56" rx="18" fill="#d7f6f3" />
        <rect
          className="pf-fixed-pulse"
          x="28"
          y="26"
          width="124"
          height="48"
          rx="15"
          fill="none"
          stroke="#12c2b8"
          strokeWidth="2.4"
        />
        <rect x="42" y="40" width="72" height="10" rx="5" fill="#12c2b8" />
        <rect x="42" y="58" width="48" height="8" rx="4" fill="#0c1b2e" opacity="0.5" />
        <g transform="translate(128 44)">
          <g className="pf-fixed-pulse">
            <path
              d="M6 -7 v-3.4 a4 4 0 0 1 8 0 V-7"
              fill="none"
              stroke="#0c1b2e"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect x="4" y="-7" width="12" height="11" rx="2.2" fill="#0c1b2e" />
            <circle cx="10" cy="-1.2" r="1.5" fill="#2ee6d6" />
          </g>
        </g>
      </svg>
    );
  }

  if (type === "Milestone") {
    return (
      <svg viewBox="0 0 180 100" className={`h-24 w-full ${live}`} aria-hidden="true">
        {[28, 82, 136].map((x, i) => (
          <g key={x}>
            <circle
              className={`pf-ms-node ${i === 1 ? "pf-ms-node-2" : i === 2 ? "pf-ms-node-3" : ""}`}
              cx={x}
              cy="50"
              r="15"
              fill={i === 1 ? "#12c2b8" : i === 2 ? "#6b7cff" : "#4f8cff"}
            />
            {i < 2 ? (
              <path d={`M${x + 15} 50 H${x + 39}`} stroke="#c5d2e4" strokeWidth="3.5" />
            ) : null}
          </g>
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 180 100" className={`h-24 w-full ${live}`} aria-hidden="true">
      <path
        d={STREAM}
        fill="none"
        stroke="#9deee7"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        className="pf-flow-line"
        d={STREAM}
        fill="none"
        stroke="#12c2b8"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="6 10"
      />
      <g className="pf-am">
        <circle r="9" fill="#8b7bff" opacity="0.35" />
        <circle r="4.6" fill="#ffffff" />
        <circle r="2.8" fill="#6b7cff" />
        <animateMotion dur="2.4s" repeatCount="indefinite" rotate="0" path={STREAM} />
      </g>
      <circle cx="162" cy="36" r="8" fill="#6b7cff" />
    </svg>
  );
}
