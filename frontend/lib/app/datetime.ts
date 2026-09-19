export function toDatetimeLocalValue(secondsFromNow = 86_400): string {
  const date = new Date(Date.now() + secondsFromNow * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatUnix(seconds: number): string {
  if (!seconds) return "Not set";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/**
 * Informational revision-window remaining text from a stored unix deadline.
 * Local clock only — not on-chain Clock, not second-perfect.
 */
export function formatRevisionRemaining(
  deadlineUnix: number,
  nowUnix: number
): string {
  if (deadlineUnix <= 0) return "Not set";
  if (nowUnix >= deadlineUnix) return "Revision deadline passed";
  const remaining = deadlineUnix - nowUnix;
  const days = Math.floor(remaining / 86_400);
  if (days >= 1) {
    return days === 1 ? "1 day remaining" : `${days} days remaining`;
  }
  const hours = Math.floor(remaining / 3600);
  if (hours >= 1) {
    return hours === 1 ? "1 hour remaining" : `${hours} hours remaining`;
  }
  const minutes = Math.floor(remaining / 60);
  if (minutes >= 1) {
    return minutes === 1 ? "1 minute remaining" : `${minutes} minutes remaining`;
  }
  return "Less than 1 minute remaining";
}

export function isUnixDeadlinePassed(
  deadlineUnix: number,
  nowUnix: number
): boolean {
  return deadlineUnix > 0 && nowUnix >= deadlineUnix;
}

/** Human-readable review window from on-chain `review_duration` seconds. */
export function formatReviewPeriod(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return "0 seconds";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts: string[] = [];
  const push = (count: number, singular: string, plural: string) => {
    if (count <= 0) return;
    parts.push(`${count} ${count === 1 ? singular : plural}`);
  };
  push(days, "day", "days");
  push(hours, "hour", "hours");
  push(minutes, "minute", "minutes");
  if (parts.length === 0 || remainder > 0) {
    push(remainder, "second", "seconds");
  }
  return parts.join(" ");
}
