import { ADMIN_PERIODS } from "./constants";

export type AnalyticsRange = {
  period: "7d" | "30d" | "90d" | "custom";
  from?: string;
  to?: string;
};

export function rangeQuery(range: AnalyticsRange) {
  if (range.period === "custom") {
    return {
      period: "custom" as const,
      from: range.from ? `${range.from}T00:00:00` : undefined,
      to: range.to ? `${range.to}T23:59:59` : undefined,
    };
  }
  return { period: range.period };
}

export function rangeLabel(range: AnalyticsRange) {
  if (range.period === "custom") {
    if (!range.from || !range.to) return "Custom range";
    return `${range.from} → ${range.to}`;
  }
  return ADMIN_PERIODS.find((p) => p.value === range.period)?.label ?? range.period;
}

export function isRangeReady(range: AnalyticsRange) {
  return range.period !== "custom" || (!!range.from && !!range.to);
}
