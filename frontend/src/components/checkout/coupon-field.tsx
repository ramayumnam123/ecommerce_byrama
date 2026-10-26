"use client";

import { Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CouponField({
  code,
  onCodeChange,
  appliedCode,
  onApply,
  onRemove,
  message,
  error,
  disabled,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  appliedCode: string | null;
  onApply: () => void;
  onRemove: () => void;
  message?: string | null;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="checkout-coupon"
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        <Tag className="size-3.5" /> Coupon
      </label>
      <div className="flex gap-2">
        <Input
          id="checkout-coupon"
          value={code}
          onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
          placeholder="WELCOME10"
          className="h-9"
          disabled={disabled || !!appliedCode}
          autoComplete="off"
        />
        {appliedCode ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="h-9 w-9"
            onClick={onRemove}
            aria-label="Remove coupon"
          >
            <X />
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={onApply}
            disabled={disabled || code.trim().length < 2}
          >
            Apply
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!error && appliedCode && message ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>
      ) : null}
    </div>
  );
}
