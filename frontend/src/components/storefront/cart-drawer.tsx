"use client";

import { Drawer } from "vaul";
import Link from "next/link";
import { ArrowRight, ShoppingBag, Truck } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { useAuthStore } from "@/lib/auth";
import { formatPaise } from "@/lib/money";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { CartLine } from "./cart-line";

export function CartDrawer() {
  const open = useCartStore((s) => s.drawerOpen);
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const cart = useCartStore((s) => s.cart);
  const user = useAuthStore((s) => s.user);

  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cart.totals.subtotal);
  const progress = Math.min(100, (cart.totals.subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-background shadow-2xl outline-none">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4" />
              <Drawer.Title className="text-sm font-semibold uppercase tracking-[0.14em]">
                Your bag
              </Drawer.Title>
              <span className="text-xs text-muted-foreground">
                ({cart.totals.total_items})
              </span>
            </div>
            <Drawer.Close asChild>
              <Button variant="ghost" size="sm">
                Close
              </Button>
            </Drawer.Close>
          </div>
          <Drawer.Description className="sr-only">
            Review the items in your shopping bag and proceed to checkout.
          </Drawer.Description>

          {cart.items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={ShoppingBag}
                title="Your bag is empty"
                description="Once you add something, it will live here."
                action={
                  <Button asChild onClick={() => setOpen(false)}>
                    <Link href="/products">
                      Browse the collection <ArrowRight />
                    </Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="border-b px-5 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Truck className="size-3.5" />
                  {remaining > 0 ? (
                    <span>
                      You&apos;re <strong className="text-foreground">{formatPaise(remaining)}</strong>{" "}
                      away from free shipping.
                    </span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Free shipping unlocked.
                    </span>
                  )}
                </div>
                <Progress value={progress} />
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                {cart.items.map((line) => (
                  <CartLine key={line.product_variant_id} line={line} compact />
                ))}
              </div>
              <div className="border-t bg-card px-5 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="price-tabular text-base font-semibold">
                    {formatPaise(cart.totals.subtotal)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Shipping and taxes calculated at checkout.
                </p>
                <Separator className="my-4" />
                <div className="grid gap-2">
                  <Button asChild size="lg" onClick={() => setOpen(false)}>
                    <Link href={user ? "/checkout" : "/signin?next=%2Fcheckout"}>
                      Checkout <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" onClick={() => setOpen(false)}>
                    <Link href="/cart">View bag</Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
