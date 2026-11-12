"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Package,
  ShoppingBag,
} from "lucide-react";
import { api, unwrap } from "@/lib/api";
import type { Order, Page } from "@/lib/types";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

export function CheckoutSuccessView() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id");
  const orderNumber = searchParams.get("order");
  const [resolvedId, setResolvedId] = React.useState<string | null>(orderId);

  const lookup = useQuery({
    queryKey: ["order-lookup", orderNumber],
    enabled: !orderId && !!orderNumber,
    queryFn: async () => {
      const page = await unwrap(
        await api.GET("/api/orders", { params: { query: { page: 1, page_size: 100 } } }),
      ) as Page<Order>;
      return page.items.find((order) => order.order_number === orderNumber) ?? null;
    },
  });

  React.useEffect(() => {
    if (!resolvedId && lookup.data) setResolvedId(lookup.data.id);
  }, [lookup.data, resolvedId]);

  const orderQuery = useQuery({
    queryKey: ["order", resolvedId],
    enabled: !!resolvedId,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/orders/{order_id}", {
          params: { path: { order_id: resolvedId! } },
        }),
      ),
    refetchInterval: (query) => {
      const order = query.state.data as Order | undefined;
      return order?.status === "PENDING" ? 2000 : false;
    },
  });

  if (!orderId && !orderNumber) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon={ShoppingBag}
          title="No order selected"
          description="Head to your account to see all orders and their status."
          action={
            <Button asChild>
              <Link href="/account/orders">View orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (orderQuery.isLoading || lookup.isLoading) {
    return (
      <div className="container-page max-w-2xl py-16">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-4 h-4 w-80" />
        <Skeleton className="mt-10 h-56 w-full rounded-xl" />
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) {
    return (
      <div className="container-page max-w-2xl py-16">
        <EmptyState
          icon={Package}
          title="Order not found"
          description="It may belong to a different account, or the link is incomplete. Your payment is safe — check your email receipt."
          action={
            <Button asChild>
              <Link href="/account/orders">Go to my orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const paid = ["PAID", "SHIPPED", "DELIVERED"].includes(order.status);
  const failed = ["CANCELLED", "REFUNDED"].includes(order.status);

  return (
    <div className="container-page max-w-3xl py-12 lg:py-16">
      <div className="flex flex-col items-center text-center">
        {paid ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10">
            <CheckCircle2 className="size-7 text-emerald-700 dark:text-emerald-400" />
          </span>
        ) : failed ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-7 text-destructive" />
          </span>
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-500/15">
            <Loader2 className="size-7 animate-spin text-amber-700 dark:text-amber-400" />
          </span>
        )}

        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {paid
            ? "You're all set."
            : failed
              ? "This order needs attention."
              : "Confirming your payment"}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
          {paid
            ? `Order ${order.order_number} is confirmed. A receipt is on its way to your inbox.`
            : failed
              ? `Order ${order.order_number} is ${order.status.toLowerCase()}. If money left your account, it will be returned automatically.`
              : "Payment captured — we're waiting for the bank confirmation to land. This page updates itself; you can safely keep it open."}
        </p>
        {paid ? (
          <Badge variant="success" className="mt-4">
            <CheckCircle2 /> {order.status === "PAID" ? "Paid" : order.status}
          </Badge>
        ) : (
          <StatusBadge status={order.status} className="mt-4" />
        )}
      </div>

      <div className="mt-10 rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Order
            </p>
            <p className="font-mono text-sm">{order.order_number}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Placed
            </p>
            <p className="text-sm">{formatDate(order.created_at)}</p>
          </div>
        </div>

        <div className="divide-y px-5">
          {(order.items ?? []).map((item) => (
            <div key={item.product_variant_id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variant_name} · Qty {item.quantity}
                </p>
              </div>
              <span className="price-tabular">{formatPaise(item.line_total)}</span>
            </div>
          ))}
        </div>

        <div className="border-t px-5 py-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="price-tabular">{formatPaise(order.subtotal)}</dd>
            </div>
            {order.discount ? (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <dt>Discount</dt>
                <dd className="price-tabular">−{formatPaise(order.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="price-tabular">
                {order.shipping_fee === 0 ? "Free" : formatPaise(order.shipping_fee)}
              </dd>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-semibold">
              <dt>Total paid</dt>
              <dd className="price-tabular">{formatPaise(order.total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {!paid && !failed ? (
        <Alert className="mt-4">
          <Clock />
          <AlertTitle>No action needed</AlertTitle>
          <AlertDescription>
            We will never show a failure for a captured payment. If this stays pending
            for more than a few minutes, contact support with order{" "}
            {order.order_number}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={`/account/orders/${order.id}`}>View order details</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Mail className="size-3.5" /> A confirmation email is on its way. Check spam if
        it hasn&apos;t arrived in 10 minutes.
      </p>
    </div>
  );
}
