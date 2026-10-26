"use client";

import Link from "next/link";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import type { CartLine as CartLineType } from "@/lib/types";
import { formatPaise } from "@/lib/money";
import { mediaUrl } from "@/lib/utils";
import { QuantityStepper } from "./quantity-stepper";
import { useCartStore } from "@/lib/cart-store";
import { toast } from "sonner";

export function CartLine({ line, compact = false }: { line: CartLineType; compact?: boolean }) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const pending = useCartStore((s) => s.pendingVariantId === line.product_variant_id);

  async function onQuantity(next: number) {
    try {
      await updateQuantity(line.product_variant_id, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update quantity");
    }
  }

  async function onRemove() {
    try {
      await removeItem(line.product_variant_id);
      toast.success("Removed from bag");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove item");
    }
  }

  return (
    <div className="flex gap-3">
      <Link
        href={`/products/${line.product_slug}`}
        className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted"
      >
        {line.image_url ? (
          <Image
            src={mediaUrl(line.image_url)!}
            alt={line.product_name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/products/${line.product_slug}`}
              className="line-clamp-2 text-sm font-medium hover:underline"
            >
              {line.product_name}
            </Link>
            <p className="text-xs text-muted-foreground">{line.variant_name}</p>
            {!line.in_stock ? (
              <p className="mt-0.5 text-[11px] font-medium text-destructive">Out of stock</p>
            ) : compact && line.stock <= 5 ? (
              <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                Only {line.stock} left
              </p>
            ) : null}
          </div>
          <p className="price-tabular shrink-0 text-sm font-medium">
            {formatPaise(line.line_total)}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <QuantityStepper
            value={line.quantity}
            max={Math.max(1, Math.min(line.stock, 99))}
            onChange={onQuantity}
            size="sm"
            disabled={pending}
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            aria-label={`Remove ${line.product_name}`}
            className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
