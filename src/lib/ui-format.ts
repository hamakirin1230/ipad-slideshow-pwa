const uiDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatUiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return uiDateTimeFormatter.format(date);
}

export function formatUiCount(value: number | null, suffix = "") {
  return value === null ? "—" : `${value}${suffix}`;
}
