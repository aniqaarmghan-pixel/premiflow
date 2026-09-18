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
