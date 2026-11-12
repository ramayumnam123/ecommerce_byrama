"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingBag, Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ProductDetail, ProductVariant } from "@/lib/types";
import { useCartStore } from "@/lib/cart-store";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "./quantity-stepper";
import { VariantPicker } from "./variant-picker";

function findVariant(
  variants: ProductVariant[],
  attributes: Record<string, string>,
): ProductVariant | null {
  return (
    variants.find((variant) =>
      Object.entries(attributes).every(
        ([key, value]) => String(variant.attributes?.[key] ?? "") === value,
      ),
    ) ?? null
  );
}

export function AddToCart({ product }: { product: ProductDetail }) {
  const addItem = useCartStore((s) => s.addItem);
  const loading = useCartStore((s) => s.loading);
  const router = useRouter();

  const initial =
    product.variants.find((v) => v.stock > 0) ??
    product.variants[0] ??
    null;
  const [attributes, setAttributes] = React.useState<Record<string, string>>(
    (initial?.attributes as Record<string, string>) ?? {},
  );
  const [quantity, setQuantity] = React.useState(1);
  const [adding, setAdding] = React.useState(false);

  const variant = findVariant(product.variants, attributes);
  const stock = variant?.stock ?? 0;
  const inStock = !!variant && stock > 0;
  const maxQty = Math.max(1, Math.min(stock || 1, 99));

  React.useEffect(() => {
    setQuantity((q) => Math.min(q, maxQty));
  }, [maxQty]);

  const price = variant?.price ?? product.min_price;
  const compareAt = variant?.compare_at_price ?? product.compare_at_price;

  async function handleAdd(buyNow = false) {
    if (!variant) {
      toast.error("Choose an available option first");
      return;
    }
    setAdding(true);
    try {
      await addItem(variant.id, quantity);
      toast.success("Added to your bag", {
        description: `${product.name} · ${variant.name}`,
      });
      if (buyNow) router.push("/checkout");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add to bag");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="price-tabular text-2xl font-semibold tracking-tight">
            {formatPaise(price)}
          </span>
          {compareAt && compareAt > price ? (
            <>
              <span className="price-tabular text-sm text-muted-foreground line-through">
                {formatPaise(compareAt)}
              </span>
              <Badge variant="copper">
                Save {formatPaise(compareAt - price)}
              </Badge>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Inclusive of all taxes.</p>
      </div>

      <VariantPicker
        variants={product.variants}
        selected={attributes}
        onSelect={setAttributes}
      />

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {inStock ? (
            stock <= 5 ? (
              <span className="text-amber-700 dark:text-amber-400">Only {stock} left</span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">In stock</span>
            )
          ) : (
            <span className="text-destructive">Out of stock</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            max={maxQty}
            disabled={!inStock || adding}
          />
          <Button
            size="lg"
            className="min-w-44 flex-1"
            disabled={!inStock || adding || loading}
            onClick={() => handleAdd(false)}
          >
            {adding ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
            {inStock ? "Add to bag" : "Sold out"}
          </Button>
        </div>
        {inStock ? (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={adding || loading}
            onClick={() => handleAdd(true)}
          >
            Buy it now
          </Button>
        ) : null}
      </div>

      <ul className="grid gap-2.5 rounded-xl border bg-card p-4 text-xs text-muted-foreground sm:grid-cols-3">
        <li className={cn("flex items-center gap-2")}>
          <Truck className="size-4 shrink-0" /> Free shipping over ₹999
        </li>
        <li className="flex items-center gap-2">
          <RotateCcw className="size-4 shrink-0" /> 14-day returns
        </li>
        <li className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0" /> Secure payments
        </li>
      </ul>
    </div>
  );
}
