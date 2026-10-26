"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/lib/cart-store";
import { useAuthStore } from "@/lib/auth";
import { formatPaise } from "@/lib/money";
import { FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_FEE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { CartLine } from "@/components/storefront/cart-line";

export function CartView() {
  const cart = useCartStore((s) => s.cart);
  const loading = useCartStore((s) => s.loading);
  const coupon = useCartStore((s) => s.coupon);
  const setCoupon = useCartStore((s) => s.setCoupon);
  const clear = useCartStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = React.useState(coupon?.code ?? "");
  const [clearing, setClearing] = React.useState(false);

  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cart.totals.subtotal);
  const progress = Math.min(100, (cart.totals.subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const shipping =
    cart.totals.subtotal === 0 || cart.totals.subtotal >= FREE_SHIPPING_THRESHOLD
      ? 0
      : FLAT_SHIPPING_FEE;
  const discount = coupon?.discount ?? 0;
  const estimate = Math.max(0, cart.totals.subtotal - discount + shipping);

  function applyCoupon() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 2) {
      toast.error("Enter a coupon code");
      return;
    }
    setCoupon({
      code: trimmed,
      discount: 0,
      message: user
        ? "Code saved — the exact discount is confirmed at checkout."
        : "Code saved. Sign in at checkout to apply it.",
    });
    toast.success(`${trimmed} saved`, {
      description: "The discount is confirmed against your address at checkout.",
    });
  }

  async function clearCart() {
    setClearing(true);
    await clear();
    setClearing(false);
    toast.success("Bag emptied");
  }

  if (!cart.items.length) {
    return (
      <div className="container-page py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Your bag</h1>
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          description="Good things start with one piece. Browse the collection and add something you'll actually keep."
          className="mt-8"
          action={
            <Button asChild>
              <Link href="/products">
                Shop the collection <ArrowRight />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your bag</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cart.totals.total_items} {cart.totals.total_items === 1 ? "item" : "items"} ·
            reserved only after you place the order
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCart}
          disabled={clearing || loading}
          className="text-muted-foreground"
        >
          {clearing ? <Loader2 className="animate-spin" /> : <Trash2 />} Empty bag
        </Button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card px-5 py-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Truck className="size-4" />
              {remaining > 0 ? (
                <span>
                  Add <strong className="text-foreground">{formatPaise(remaining)}</strong> more
                  for free shipping.
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400">
                  Free shipping unlocked.
                </span>
              )}
            </div>
            <Progress value={progress} />
          </div>

          <div className="divide-y rounded-xl border bg-card px-5">
            {cart.items.map((line) => (
              <div key={line.product_variant_id} className="py-5">
                <CartLine line={line} />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="outline">
              <Link href="/products">Continue shopping</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Prices include taxes. Final totals at checkout.
            </p>
          </div>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Order summary
            </h2>

            <div className="space-y-2">
              <label
                htmlFor="coupon"
                className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                <Tag className="size-3.5" /> Coupon
              </label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="h-9"
                  disabled={!!coupon}
                />
                {coupon ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-9 w-9"
                    onClick={() => {
                      setCoupon(null);
                      setCode("");
                    }}
                    aria-label="Remove coupon"
                  >
                    <X />
                  </Button>
                ) : (
                  <Button type="button" size="sm" className="h-9" onClick={applyCoupon}>
                    Apply
                  </Button>
                )}
              </div>
              {coupon ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {coupon.code} — {coupon.message}
                </p>
              ) : null}
            </div>

            <Separator />

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="price-tabular">{formatPaise(cart.totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="price-tabular">
                  {shipping === 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">Free</span>
                  ) : (
                    formatPaise(shipping)
                  )}
                </dd>
              </div>
              {discount ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>Discount</dt>
                  <dd className="price-tabular">−{formatPaise(discount)}</dd>
                </div>
              ) : null}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <dt>Estimated total</dt>
                <dd className="price-tabular">{formatPaise(estimate)}</dd>
              </div>
            </dl>

            <Button asChild size="lg" className="w-full">
              <Link href={user ? "/checkout" : "/signin?next=%2Fcheckout"}>
                {user ? "Proceed to checkout" : "Sign in to checkout"} <ArrowRight />
              </Link>
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Secure checkout · Razorpay · UPI, cards & netbanking
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
