"use client";

import type { ProductVariant } from "@/lib/types";
import { cn, slugToTitle } from "@/lib/utils";

export function VariantPicker({
  variants,
  selected,
  onSelect,
}: {
  variants: ProductVariant[];
  selected: Record<string, string>;
  onSelect: (attributes: Record<string, string>) => void;
}) {
  const keys = Array.from(
    new Set(variants.flatMap((v) => Object.keys(v.attributes ?? {}))),
  );

  if (!keys.length) return null;

  const valuesFor = (key: string) =>
    Array.from(
      new Set(
        variants
          .map((v) => v.attributes?.[key])
          .filter((value): value is string => Boolean(value)),
      ),
    );

  const isAvailable = (key: string, value: string) => {
    // A value is selectable if some in-stock variant matches it plus the other selections.
    return variants.some((variant) => {
      if ((variant.stock ?? 0) <= 0) return false;
      if (String(variant.attributes?.[key] ?? "") !== value) return false;
      return Object.entries(selected).every(([k, v]) => {
        if (k === key) return true;
        return String(variant.attributes?.[k] ?? "") === v;
      });
    });
  };

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const options = valuesFor(key);
        return (
          <fieldset key={key}>
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {slugToTitle(key)}
              {selected[key] ? (
                <span className="ml-2 normal-case tracking-normal text-foreground">
                  {String(selected[key])}
                </span>
              ) : null}
            </legend>
            <div className="flex flex-wrap gap-2">
              {options.map((value) => {
                const active = selected[key] === value;
                const available = isAvailable(key, value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    disabled={!available}
                    onClick={() => onSelect({ ...selected, [key]: value })}
                    className={cn(
                      "min-w-11 rounded-md border px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "hover:border-foreground/50",
                      !available && "cursor-not-allowed opacity-40 line-through",
                    )}
                  >
                    {String(value)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
