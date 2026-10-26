import type { Quote } from "@/lib/types";
import { formatPaise } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export function OrderSummary({
  quote,
  loading,
  itemCount,
}: {
  quote: Quote | null;
  loading?: boolean;
  itemCount: number;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
          Order summary
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {itemCount} {itemCount === 1 ? "item" : "items"} · totals confirmed by the server
        </p>
      </div>
      <div className="space-y-4 p-5">
        {loading || !quote ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            <Separator />
            <div className="flex justify-between gap-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="price-tabular">{formatPaise(quote.subtotal)}</dd>
              </div>
              {quote.discount > 0 ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>Discount {quote.coupon_code ? `(${quote.coupon_code})` : ""}</dt>
                  <dd className="price-tabular">−{formatPaise(quote.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="price-tabular">
                  {quote.shipping === 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">Free</span>
                  ) : (
                    formatPaise(quote.shipping)
                  )}
                </dd>
              </div>
              {quote.tax > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="price-tabular">{formatPaise(quote.tax)}</dd>
                </div>
              ) : null}
              <Separator className="my-3" />
              <div className="flex items-baseline justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="price-tabular text-xl">{formatPaise(quote.total)}</dd>
              </div>
            </dl>
            <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Stock is only reserved once you place the order. Unpaid orders release
              automatically after 15 minutes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
