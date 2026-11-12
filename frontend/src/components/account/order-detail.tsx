"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Circle,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import type { Order } from "@/lib/types";
import { formatDateTime, formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

function Timeline({ order }: { order: Order }) {
  const steps = [
    { key: "placed", label: "Order placed", done: true, at: order.created_at },
    {
      key: "paid",
      label: "Payment received",
      done: ["PAID", "SHIPPED", "DELIVERED", "REFUNDED"].includes(order.status),
      at: order.paid_at,
    },
    {
      key: "shipped",
      label: "Shipped",
      done: ["SHIPPED", "DELIVERED"].includes(order.status),
      at: null,
    },
    {
      key: "delivered",
      label: "Delivered",
      done: order.status === "DELIVERED",
      at: null,
    },
  ];

  const cancelled = ["CANCELLED", "REFUNDED"].includes(order.status);

  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={
                step.done
                  ? "flex size-6 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "flex size-6 items-center justify-center rounded-full border text-muted-foreground"
              }
            >
              {step.done ? <Check className="size-3.5" /> : <Circle className="size-2.5" />}
            </span>
            {index < steps.length - 1 ? <span className="mt-1 h-6 w-px bg-border" /> : null}
          </div>
          <div className="pt-0.5">
            <p className={step.done ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
              {step.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {step.at ? formatDateTime(step.at) : step.done ? "Completed" : "Pending"}
            </p>
          </div>
        </li>
      ))}
      {cancelled ? (
        <li className="flex gap-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">
              {order.status === "REFUNDED" ? "Refund issued" : "Cancelled"}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.cancelled_at ? formatDateTime(order.cancelled_at) : "—"}
            </p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}

export function OrderDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const query = useQuery({
    queryKey: ["order", id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/orders/{order_id}", { params: { path: { order_id: id } } }),
      ),
  });

  const cancel = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/orders/{order_id}/cancel", {
          params: { path: { order_id: id } },
        }),
      ),
    onSuccess: (order) => {
      qc.setQueryData(["order", id], order);
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order cancelled", { description: "Stock has been released." });
    },
    onError: (error) => toastApiError(error),
  });

  if (query.isLoading) {
    return (
      <div className="container-page max-w-4xl space-y-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="container-page max-w-2xl py-12">
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this order</AlertTitle>
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/account/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const order = query.data;
  const address = order.shipping_address as Record<string, string>;

  return (
    <div className="container-page max-w-4xl py-10">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All orders
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {order.order_number}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed {formatDate(order.created_at)}
            {order.tracking_number
              ? ` · Tracking ${order.carrier ?? ""} ${order.tracking_number}`
              : ""}
          </p>
        </div>
        {order.status === "PENDING" ? (
          <Button
            variant="outline"
            onClick={() => setConfirmCancel(true)}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? <Loader2 className="animate-spin" /> : null}
            Cancel order
          </Button>
        ) : null}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <Package className="size-4" />
              <h2 className="text-sm font-semibold">Items</h2>
            </div>
            <div className="divide-y px-5">
              {(order.items ?? []).map((item) => (
                <div
                  key={item.product_variant_id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div>
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variant_name} · Qty {item.quantity} · {item.sku}
                    </p>
                  </div>
                  <span className="price-tabular text-sm">
                    {formatPaise(item.line_total)}
                  </span>
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
                {order.tax ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tax</dt>
                    <dd className="price-tabular">{formatPaise(order.tax)}</dd>
                  </div>
                ) : null}
                {order.refund_amount ? (
                  <div className="flex justify-between text-destructive">
                    <dt>Refunded</dt>
                    <dd className="price-tabular">−{formatPaise(order.refund_amount)}</dd>
                  </div>
                ) : null}
                <Separator className="my-2" />
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="price-tabular">{formatPaise(order.total)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4" /> Delivery address
            </h2>
            <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <p className="text-foreground">{address.line1}</p>
              {address.line2 ? <p>{address.line2}</p> : null}
              <p>
                {[address.city, address.state, address.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{address.country}</p>
              <p className="mt-1">{address.phone}</p>
            </div>
          </section>

          {order.notes ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="size-4" /> Order notes
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{order.notes}</p>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Status</h2>
            <div className="mt-4">
              <Timeline order={order} />
            </div>
          </section>

          {order.payment ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="size-4" /> Payment
              </h2>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{order.payment.status}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="price-tabular">{formatPaise(order.payment.amount)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="truncate font-mono">{order.payment.provider_order_id}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <div className="rounded-xl border border-dashed p-5 text-xs leading-relaxed text-muted-foreground">
            Need help with this order? Reply to your confirmation email and a human will
            pick it up.
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this order?"
        description="Stock is released immediately and the order cannot be reopened. If you already paid, contact support for a refund."
        confirmLabel="Cancel order"
        destructive
        onConfirm={async () => {
          try {
            await cancel.mutateAsync();
          } catch {
            // toast already shown
          }
        }}
      />
    </div>
  );
}
