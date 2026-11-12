"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { ApiError, messageForError, toastApiError } from "@/lib/errors";
import { useAuthStore, useMe } from "@/lib/auth";
import { useCartStore } from "@/lib/cart-store";
import { getGuestToken } from "@/lib/session";
import type { Address, CheckoutStart, Order, Quote } from "@/lib/types";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { AddressForm, type AddressValues } from "./address-form";
import { CouponField } from "./coupon-field";
import { OrderSummary } from "./order-summary";
import { RazorpayButton } from "./razorpay-button";

function AddressCard({
  address,
  selected,
  onSelect,
}: {
  address: Address;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
        selected ? "border-foreground bg-accent/40" : "hover:border-foreground/30",
      )}
    >
      <input
        type="radio"
        name="address"
        checked={selected}
        onChange={onSelect}
        className="mt-1 size-4 accent-[oklch(0.58_0.12_48)]"
      />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{address.line1}</span>
          {address.is_default ? <Badge variant="outline">Default</Badge> : null}
        </div>
        <p className="mt-0.5 text-muted-foreground">
          {[address.line2, address.city, address.state, address.postal_code]
            .filter(Boolean)
            .join(", ")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{address.phone}</p>
      </div>
    </label>
  );
}

export function CheckoutFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const cart = useCartStore((s) => s.cart);
  const couponStore = useCartStore((s) => s.coupon);
  const setCouponStore = useCartStore((s) => s.setCoupon);
  const refreshCart = useCartStore((s) => s.refresh);
  const { data: me } = useMe();
  const storeUser = useAuthStore((s) => s.user);
  const user = me ?? storeUser;

  const [selectedAddressId, setSelectedAddressId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [couponCode, setCouponCode] = React.useState(couponStore?.code ?? "");
  const [appliedCode, setAppliedCode] = React.useState<string | null>(null);
  const [couponError, setCouponError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [start, setStart] = React.useState<CheckoutStart | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [retryIn, setRetryIn] = React.useState(0);
  const idempotencyKey = React.useRef<string | null>(null);
  const paymentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setInterval(() => setRetryIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [retryIn]);

  const addressesQuery = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => unwrap(await api.GET("/api/users/addresses")),
  });

  React.useEffect(() => {
    if (selectedAddressId || !addressesQuery.data?.length) return;
    const preferred =
      addressesQuery.data.find((a) => a.is_default) ?? addressesQuery.data[0];
    setSelectedAddressId(preferred.id);
  }, [addressesQuery.data, selectedAddressId]);

  const createAddress = useMutation({
    mutationFn: async (values: AddressValues) =>
      unwrap(
        await api.POST("/api/users/addresses", {
          body: {
            line1: values.line1,
            line2: values.line2 || undefined,
            city: values.city,
            state: values.state,
            postal_code: values.postal_code,
            country: values.country.toUpperCase(),
            phone: values.phone,
            is_default: values.is_default,
          },
        }),
      ),
    onSuccess: (address) => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setSelectedAddressId(address.id);
      setShowForm(false);
      toast.success("Address saved");
    },
    onError: (error) => toastApiError(error),
  });

  const quoteQuery = useQuery<Quote>({
    queryKey: ["checkout-quote", selectedAddressId, appliedCode],
    enabled: !!selectedAddressId && !start,
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.POST("/api/checkout/quote", {
          body: {
            address_id: selectedAddressId!,
            coupon_code: appliedCode || undefined,
          },
        }),
      ),
  });

  React.useEffect(() => {
    if (quoteQuery.error) setCouponError(messageForError(quoteQuery.error));
  }, [quoteQuery.error]);

  const selectedAddress = addressesQuery.data?.find((a) => a.id === selectedAddressId);

  function handleRateLimit(error: unknown) {
    if (error instanceof ApiError && error.code === "RATE_LIMITED" && error.retryAfter) {
      setRetryIn(error.retryAfter);
    }
  }

  async function placeOrder() {
    if (!selectedAddressId) {
      toast.error("Choose a delivery address first");
      return;
    }
    setStarting(true);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await unwrap(
        await api.POST("/api/checkout/start", {
          params: { header: { "idempotency-key": idempotencyKey.current } },
          body: {
            address_id: selectedAddressId,
            coupon_code: appliedCode || undefined,
            guest_token: getGuestToken() ?? undefined,
            notes: notes || undefined,
          },
        }),
      );
      setStart(response);
      toast.success("Order reserved — complete payment", {
        description: `${response.order.order_number} · stock held for 15 minutes`,
      });
      setTimeout(() => {
        paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    } catch (error) {
      handleRateLimit(error);
      toastApiError(error);
    } finally {
      setStarting(false);
    }
  }

  async function finish(order: Order) {
    await refreshCart();
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["cart"] });
    toast.success("Payment received", {
      description: `Order ${order.order_number} is confirmed.`,
    });
    router.push(
      `/checkout/success?order=${encodeURIComponent(order.order_number)}&id=${order.id}`,
    );
  }

  async function payMock() {
    if (!start) return;
    setPaying(true);
    try {
      const order = await unwrap(
        await api.POST("/api/checkout/mock-pay", {
          params: { query: { razorpay_order_id: start.razorpay.order_id } },
        }),
      );
      if (order.status === "PAID") {
        await finish(order);
      } else {
        toast.error(`Order is ${order.status.toLowerCase()} — check your orders page`);
        router.push(`/checkout/success?order=${order.order_number}&id=${order.id}`);
      }
    } catch (error) {
      handleRateLimit(error);
      toastApiError(error);
    } finally {
      setPaying(false);
    }
  }

  async function onVerified(order: Order) {
    if (order.status === "PAID") {
      await finish(order);
    } else {
      toast.message("Payment received — confirming", {
        description: "We're waiting for the payment webhook. This page will update.",
      });
      router.push(`/checkout/success?order=${order.order_number}&id=${order.id}`);
    }
  }

  const resendVerification = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/auth/resend-verification", {
          body: { email: user?.email ?? "" },
        }),
      ),
    onSuccess: () => toast.success("Verification email sent"),
    onError: (error) => toastApiError(error),
  });

  if (!cart.items.length && !start) {
    return (
      <div className="container-page py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
        <EmptyState
          icon={XCircle}
          title="Nothing to check out"
          description="Your bag is empty. Add a piece first and we'll hold it while you pay."
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

  const locked = starting || paying || retryIn > 0 || !!start;
  const quote = quoteQuery.data ?? null;
  // Once checkout has started the cart is frozen: show the order's own
  // server-confirmed totals rather than a possibly stale quote.
  const summary: Quote | null = start
    ? {
        subtotal: start.order.subtotal,
        discount: start.order.discount,
        shipping: start.order.shipping_fee,
        tax: start.order.tax,
        total: start.order.total,
        currency: start.order.currency,
        coupon_code: appliedCode,
      }
    : quote;

  return (
    <div className="container-page py-8 lg:py-10">
      <div className="border-b pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Secure checkout
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Almost yours</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Address, payment, done. Stock is reserved only while you complete payment.
        </p>
      </div>

      {user && !user.email_verified ? (
        <Alert variant="warning" className="mt-6">
          <AlertCircle />
          <AlertTitle>Verify your email to place the order</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            We sent a link to <strong>{user.email}</strong>. It can take a minute to
            arrive.
            <Button
              size="sm"
              variant="outline"
              onClick={() => resendVerification.mutate()}
              disabled={resendVerification.isPending}
            >
              {resendVerification.isPending ? <Loader2 className="animate-spin" /> : null}
              Resend link
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section aria-labelledby="address-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="address-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <MapPin className="size-4" /> Delivery address
              </h2>
              {addressesQuery.data?.length && !showForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(true)}
                  disabled={!!start}
                >
                  <Plus /> Add new
                </Button>
              ) : null}
            </div>

            {addressesQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : addressesQuery.error ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Couldn&apos;t load addresses</AlertTitle>
                <AlertDescription>{messageForError(addressesQuery.error)}</AlertDescription>
              </Alert>
            ) : showForm || !addressesQuery.data?.length ? (
              <div className="rounded-xl border bg-card p-5">
                <p className="mb-4 text-sm font-medium">Add a delivery address</p>
                <AddressForm
                  onSubmit={async (values) => {
                    await createAddress.mutateAsync(values);
                  }}
                  submitting={createAddress.isPending}
                  submitLabel="Save & use this address"
                />
                {addressesQuery.data?.length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                {addressesQuery.data.map((address) => (
                  <AddressCard
                    key={address.id}
                    address={address}
                    selected={selectedAddressId === address.id}
                    onSelect={() => {
                      if (start) return;
                      setSelectedAddressId(address.id);
                      setCouponError(null);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="payment-heading" className="space-y-4">
            <h2 id="payment-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <ShieldCheck className="size-4" /> Payment
            </h2>

            {!start ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="notes">Order notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    placeholder="Gift note, delivery instructions, GST details…"
                    disabled={starting}
                  />
                </div>
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={placeOrder}
                  disabled={!selectedAddress || starting || retryIn > 0 || !quote}
                >
                  {starting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  {retryIn > 0
                    ? `Retry in ${retryIn}s`
                    : "Place order & pay"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Your card details never touch our servers. Payments are handled by
                  Razorpay.
                </p>
              </>
            ) : (
              <div ref={paymentRef} className="space-y-4 rounded-xl border border-foreground/20 bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Order {start.order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      Reserved until{" "}
                      {start.order.reserved_until
                        ? new Date(start.order.reserved_until).toLocaleTimeString("en-IN", {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "15 minutes from now"}
                    </p>
                  </div>
                  <Badge variant={start.razorpay.mock ? "warning" : "success"}>
                    {start.razorpay.mock ? "Dev mode" : "Razorpay secured"}
                  </Badge>
                </div>

                <div className="rounded-lg bg-muted/60 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount due</span>
                    <span className="price-tabular font-semibold">
                      {formatPaise(start.razorpay.amount)}
                    </span>
                  </div>
                </div>

                {start.razorpay.mock ? (
                  <>
                    <Alert>
                      <Sparkles />
                      <AlertTitle>Mock payment mode</AlertTitle>
                      <AlertDescription>
                        Razorpay keys aren&apos;t configured, so this simulated step runs
                        the exact same server-side capture + verify flow. No money moves.
                      </AlertDescription>
                    </Alert>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={payMock}
                      disabled={paying || retryIn > 0}
                    >
                      {paying ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      {retryIn > 0 ? `Retry in ${retryIn}s` : "Pay (simulated)"}
                    </Button>
                  </>
                ) : (
                  <RazorpayButton
                    razorpay={start.razorpay}
                    prefill={{
                      name: user?.full_name,
                      email: user?.email,
                      contact: selectedAddress?.phone,
                    }}
                    onVerified={onVerified}
                    onError={(error) => {
                      handleRateLimit(error);
                      toastApiError(error);
                    }}
                    disabled={retryIn > 0}
                  />
                )}

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  If the payment window closes, your order stays pending and stock is
                  held for 15 minutes. You can retry from this page or your orders.
                </p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-xl border bg-card p-5">
            <CouponField
              code={couponCode}
              onCodeChange={(value) => {
                setCouponCode(value);
                setCouponError(null);
              }}
              appliedCode={appliedCode}
              onApply={() => {
                setAppliedCode(couponCode.trim().toUpperCase());
                setCouponStore({
                  code: couponCode.trim().toUpperCase(),
                  discount: 0,
                  message: "Applied",
                });
                setCouponError(null);
              }}
              onRemove={() => {
                setAppliedCode(null);
                setCouponError(null);
                setCouponStore(null);
              }}
              message={
                summary?.coupon_code
                  ? `${summary.coupon_code} applied — you save ${formatPaise(summary.discount)}`
                  : null
              }
              error={couponError}
              disabled={locked}
            />
          </div>

          <OrderSummary
            quote={summary}
            loading={!start && quoteQuery.isFetching}
            itemCount={
              start
                ? (start.order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)
                : cart.totals.total_items
            }
          />

          {quoteQuery.error && !couponError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn&apos;t calculate totals</AlertTitle>
              <AlertDescription>{messageForError(quoteQuery.error)}</AlertDescription>
            </Alert>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
