/** Date-only format (e.g. "Mar 28, 2026"). Fallback: "Unknown". */
export function formatTimestampDateOnly(timestamp) {
  if (!timestamp) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Number(timestamp) * 1000));
}

/** Date + time format (e.g. "Mar 28, 2026, 2:05 PM"). Fallback: "Not scheduled". */
export function formatTimestampWithYear(timestamp) {
  if (!timestamp) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Number(timestamp) * 1000));
}
