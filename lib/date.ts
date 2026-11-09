/** The rest of Daily Quip runs on New York time; so does this. */
export const APP_TIMEZONE = "America/New_York";

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: APP_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(value: string) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDateTime(value);
}
