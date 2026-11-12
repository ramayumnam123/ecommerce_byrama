/**
 * Money is integer paise everywhere. Format only at the last mile.
 * 149900 -> "₹1,499.00"
 */
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatPaise(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return "—";
  return inr.format(paise / 100);
}

export function formatPaiseCompact(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return "—";
  return inrCompact.format(paise / 100);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

/** Rupee input (major units, e.g. "1499.00") -> integer paise. */
export function rupeesToPaise(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value || "0");
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Integer paise -> major-unit string without currency symbol, for form inputs. */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise == null) return "";
  return (paise / 100).toFixed(2);
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}
