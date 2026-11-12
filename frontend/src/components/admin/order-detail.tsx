"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Printer,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import { allowedAdminActions, formatDateTime } from "@/lib/format";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import type { AdminOrderDetail } from "@/lib/types";
import { mediaUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";

type AdminOrderItem = {
  product_variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type AdminShipping = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  full_name?: string;
};

type AdminPayment = {
  id?: string;
  kind?: string;
  amount?: number;
  status?: string;
  provider_order_id?: string | null;
  provider_payment_id?: string | null;
  raw_payload?: unknown;
};

function Timeline({ order }: { order: AdminOrderDetail }) {
  const events: { label: string; at: string | null; done: boolean; icon: React.ElementType }[] = [
    { label: "Order placed", at: order.created_at, done: true, icon: Clock },
    { label: "Payment captured", at: order.paid_at, done: !!order.paid_at, icon: CreditCard },
    {
      label: order.cancelled_at ? "Order cancelled" : "Shipped",
      at: order.cancelled_at ?? (order.status === "SHIPPED" || order.status === "DELIVERED" ? order.created_at : null),
      done: !!order.cancelled_at || order.status === "SHIPPED" || order.status === "DELIVERED",
      icon: order.cancelled_at ? XCircle : Truck,
    },
    {
      label: "Delivered",
      at: order.status === "DELIVERED" ? order.created_at : null,
      done: order.status === "DELIVERED",
      icon: CheckCircle2,
    },
    {
      label: "Refunded",
      at: order.refund_amount > 0 ? order.created_at : null,
      done: order.refund_amount > 0,
      icon: RotateCcw,
    },
  ];

  return (
    <ol className="space-y-4">
      {events.map((event, index) => (
        <li key={event.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`flex size-7 items-center justify-center rounded-full border ${
                event.done
                  ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
            >
              <event.icon className="size-3.5" />
            </span>
            {index < events.length - 1 ? <span className="mt-1 h-6 w-px bg-border" /> : null}
          </div>
          <div className="pb-1">
            <p className={`text-sm ${event.done ? "" : "text-muted-foreground"}`}>
              {event.label}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {event.done && event.at ? formatDateTime(event.at) : "Not reached"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AdminOrderDetailView({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [shipOpen, setShipOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [tracking, setTracking] = React.useState("");
  const [carrier, setCarrier] = React.useState("");
  const [adminNote, setAdminNote] = React.useState("");
  const [refundAmount, setRefundAmount] = React.useState("");
  const [refundReason, setRefundReason] = React.useState("");

  const query = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/orders/{order_id}", {
          params: { path: { order_id: orderId } },
        }),
      ),
  });

  const order = query.data;
  const actions = order ? allowedAdminActions(order.status) : null;
  const refundable = order ? order.total - order.refund_amount : 0;

  React.useEffect(() => {
    if (order && refundOpen) {
      setRefundAmount((Math.max(0, refundable) / 100).toFixed(2));
    }
  }, [order, refundOpen, refundable]);

  const afterChange = (updated: AdminOrderDetail) => {
    qc.setQueryData(["admin", "order", orderId], updated);
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    qc.invalidateQueries({ queryKey: ["admin", "analytics"] });
  };

  const setStatus = useMutation({
    mutationFn: async (body: {
      status: "SHIPPED" | "DELIVERED" | "CANCELLED";
      tracking_number?: string;
      carrier?: string;
      admin_note?: string;
    }) =>
      unwrap(
        await api.PATCH("/api/admin/orders/{order_id}/status", {
          params: { path: { order_id: orderId } },
          body,
        }),
      ),
    onSuccess: (updated) => {
      afterChange(updated);
      setShipOpen(false);
      setCancelOpen(false);
      toast.success(`Order marked ${updated.status.toLowerCase()}`);
    },
    onError: (error) => toastApiError(error),
  });

  const refund = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/admin/orders/{order_id}/refund", {
          params: { path: { order_id: orderId } },
          body: {
            amount: rupeesToPaise(refundAmount),
            reason: refundReason.trim() || undefined,
          },
        }),
      ),
    onSuccess: (updated) => {
      afterChange(updated);
      setRefundOpen(false);
      setRefundReason("");
      toast.success("Refund issued", {
        description: `${formatPaise(updated.refund_amount)} refunded in total.`,
      });
    },
    onError: (error) => toastApiError(error),
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (query.error || !order) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{messageForError(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const items = order.items as unknown as AdminOrderItem[];
  const shipping = order.shipping_address as unknown as AdminShipping;
  const payment = order.payment as unknown as AdminPayment | null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link href="/admin/orders">
              <ArrowLeft /> All orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {order.order_number}
            </h1>
            <StatusBadge status={order.status} />
            {order.refund_amount > 0 ? (
              <Badge variant="secondary">Refunded {formatPaise(order.refund_amount)}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Placed {formatDateTime(order.created_at)} · {order.item_count} item
            {order.item_count === 1 ? "" : "s"} · {order.user.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          {actions?.canShip ? (
            <Button size="sm" onClick={() => setShipOpen(true)}>
              <Truck /> Ship order
            </Button>
          ) : null}
          {actions?.canDeliver ? (
            <Button
              size="sm"
              onClick={() => setStatus.mutate({ status: "DELIVERED" })}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Mark delivered
            </Button>
          ) : null}
          {actions?.canRefund ? (
            <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
              <RotateCcw /> Refund
            </Button>
          ) : null}
          {actions?.canCancel ? (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle /> Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Items</h2>
            </div>
            <ul className="divide-y">
              {items.map((item) => {
                const src = mediaUrl(item.image_url);
                return (
                  <li
                    key={`${item.product_variant_id}-${item.sku}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {src ? (
                        <Image src={src} alt="" fill sizes="48px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variant_name} · <span className="font-mono">{item.sku}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="price-tabular text-sm">{formatPaise(item.line_total)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.quantity} × {formatPaise(item.unit_price)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1.5 border-t px-5 py-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="price-tabular">{formatPaise(order.subtotal)}</span>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Discount</span>
                  <span className="price-tabular">−{formatPaise(order.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span className="price-tabular">{formatPaise(order.shipping_fee)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="price-tabular">{formatPaise(order.tax)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span className="price-tabular">{formatPaise(order.total)}</span>
              </div>
              {order.refund_amount > 0 ? (
                <div className="flex justify-between text-xs text-destructive">
                  <span>Refunded</span>
                  <span className="price-tabular">−{formatPaise(order.refund_amount)}</span>
                </div>
              ) : null}
            </div>
          </section>

          {payment ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold tracking-tight">Payment</h2>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Kind / status</p>
                  <p className="mt-0.5">
                    {payment.kind} · {payment.status}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="price-tabular mt-0.5">{formatPaise(payment.amount ?? 0)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Provider IDs</p>
                  <p className="mt-0.5 break-all font-mono text-[11px]">
                    {payment.provider_order_id ?? "—"} / {payment.provider_payment_id ?? "—"}
                  </p>
                </div>
              </div>
              {payment.raw_payload ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Raw gateway payload
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">
                    {JSON.stringify(payment.raw_payload, null, 2)}
                  </pre>
                </details>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Timeline</h2>
            <div className="mt-4">
              <Timeline order={order} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Customer</h2>
            <p className="mt-2 text-sm">{order.user.full_name}</p>
            <p className="text-xs text-muted-foreground">{order.user.email}</p>
            <Button variant="ghost" size="sm" asChild className="mt-2 -ml-2">
              <Link href={`/admin/customers?q=${encodeURIComponent(order.user.email)}`}>
                View customer
              </Link>
            </Button>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <MapPin className="size-4" /> Shipping address
            </h2>
            <div className="mt-2 space-y-0.5 text-sm">
              {shipping.full_name ? <p className="font-medium">{shipping.full_name}</p> : null}
              <p>{shipping.line1}</p>
              {shipping.line2 ? <p>{shipping.line2}</p> : null}
              <p>
                {[shipping.city, shipping.state, shipping.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{shipping.country}</p>
              {shipping.phone ? (
                <p className="pt-1 text-xs text-muted-foreground">{shipping.phone}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Fulfilment</h2>
            <dl className="mt-2 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Carrier</dt>
                <dd>{order.carrier ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Tracking</dt>
                <dd className="font-mono">{order.tracking_number ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Refundable</dt>
                <dd className="price-tabular">{formatPaise(refundable)}</dd>
              </div>
            </dl>
            {order.notes ? (
              <div className="mt-3 border-t pt-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Customer note
                </p>
                <p className="mt-1 text-xs">{order.notes}</p>
              </div>
            ) : null}
            {order.admin_note ? (
              <div className="mt-3 border-t pt-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Admin note
                </p>
                <p className="mt-1 text-xs">{order.admin_note}</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship order</DialogTitle>
            <DialogDescription>
              Add tracking so the customer can follow the parcel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="carrier">Carrier</Label>
              <Input
                id="carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Blue Dart / Delhivery"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tracking">Tracking number</Label>
              <Input
                id="tracking"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="AWB number"
                maxLength={64}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-note">Admin note (optional)</Label>
              <Textarea
                id="ship-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                setStatus.mutate({
                  status: "SHIPPED",
                  tracking_number: tracking.trim() || undefined,
                  carrier: carrier.trim() || undefined,
                  admin_note: adminNote.trim() || undefined,
                })
              }
              disabled={setStatus.isPending || !tracking.trim()}
            >
              {setStatus.isPending ? <Loader2 className="animate-spin" /> : <Truck />}
              Mark shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue refund</DialogTitle>
            <DialogDescription>
              {formatPaise(refundable)} is refundable on this order. Full refunds mark the
              order REFUNDED and restock pre-shipment items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount (₹)</Label>
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                max={(refundable / 100).toFixed(2)}
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason (optional)</Label>
              <Textarea
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                maxLength={500}
                placeholder="Damaged in transit, customer return…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => refund.mutate()}
              disabled={
                refund.isPending ||
                rupeesToPaise(refundAmount) <= 0 ||
                rupeesToPaise(refundAmount) > refundable
              }
            >
              {refund.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Refund {formatPaise(rupeesToPaise(refundAmount))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description={
          order.status === "PAID"
            ? "The captured payment will be refunded in full, stock restored, and the customer emailed."
            : "Stock will be restored and the reservation released."
        }
        confirmLabel="Cancel order"
        destructive
        onConfirm={async () => {
          await setStatus.mutateAsync({ status: "CANCELLED" });
        }}
      />
    </div>
  );
}
