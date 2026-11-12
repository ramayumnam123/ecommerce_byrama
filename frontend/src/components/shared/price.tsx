"use client";

import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";

export function Price({
  value,
  compareAt,
  className,
  size = "default",
}: {
  value: number;
  compareAt?: number | null;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const off =
    compareAt && compareAt > value
      ? Math.round(((compareAt - value) / compareAt) * 100)
      : 0;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span
        className={cn(
          "price-tabular font-medium tracking-tight",
          size === "sm" && "text-sm",
          size === "lg" && "text-xl",
        )}
      >
        {formatPaise(value)}
      </span>
      {compareAt && compareAt > value ? (
        <>
          <span className="price-tabular text-xs text-muted-foreground line-through">
            {formatPaise(compareAt)}
          </span>
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            {off}% off
          </span>
        </>
      ) : null}
    </span>
  );
}
