"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CART_MAX_QTY } from "@/lib/constants";

export function QuantityStepper({
  value,
  onChange,
  max = CART_MAX_QTY,
  min = 1,
  size = "default",
  disabled,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  min?: number;
  size?: "sm" | "default";
  disabled?: boolean;
  className?: string;
}) {
  const limit = Math.max(min, Math.min(max || CART_MAX_QTY, CART_MAX_QTY));

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border",
        size === "sm" ? "h-8" : "h-10",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className={cn(
          "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
          size === "sm" ? "size-8" : "size-10",
        )}
      >
        <Minus className="size-3.5" />
      </button>
      <span
        aria-live="polite"
        className={cn(
          "price-tabular min-w-8 text-center text-sm font-medium",
          size === "sm" && "min-w-7 text-xs",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(limit, value + 1))}
        disabled={disabled || value >= limit}
        className={cn(
          "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
          size === "sm" ? "size-8" : "size-10",
        )}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
