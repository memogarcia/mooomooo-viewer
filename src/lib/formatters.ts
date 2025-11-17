const defaultDateFormat: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export const formatDateTime = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleString(undefined, options ?? defaultDateFormat);

export const formatDate = formatDateTime;

export const formatRelative = (value: string) => {
  const timestamp = new Date(value).getTime();
  const delta = Date.now() - timestamp;
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
};

export const shortId = (value: string, visible = 4) => {
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
};
