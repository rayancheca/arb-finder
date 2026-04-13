export function formatMoney(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts.sign && n > 0) return `+${s}`;
  if (n < 0) return `−${s.slice(1)}`;
  return s;
}

export function formatMoneyShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatPct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatOdds(american: number): string {
  if (american > 0) return `+${Math.round(american)}`;
  return `${Math.round(american)}`;
}

export function formatRelativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffHour) < 48) return rtf.format(diffHour, "hour");
  return rtf.format(diffDay, "day");
}

export function formatTimeShort(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
