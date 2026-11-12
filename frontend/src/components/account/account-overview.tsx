"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MailWarning, MapPin, Package, Star } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { toastApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import type { Order, Page } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/shared/status-badge";

export function AccountOverview() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (me?.full_name) setName(me.full_name);
  }, [me?.full_name]);

  const ordersQuery = useQuery({
    queryKey: ["orders", "overview"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/orders", {
          params: { query: { page: 1, page_size: 100 } },
        }),
      ),
  });

  const updateProfile = useMutation({
    mutationFn: async (fullName: string) =>
      unwrap(await api.PATCH("/api/auth/me", { body: { full_name: fullName } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated");
    },
    onError: (error) => toastApiError(error),
  });

  const resend = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/auth/resend-verification", {
          body: { email: me?.email ?? "" },
        }),
      ),
    onSuccess: () => toast.success("Verification email sent"),
    onError: (error) => toastApiError(error),
  });

  if (isLoading && !me) {
    return (
      <div className="container-page max-w-4xl space-y-4 py-10">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const orders = (ordersQuery.data as Page<Order> | undefined)?.items ?? [];
  const activeOrders = orders.filter((o) => !["CANCELLED", "REFUNDED"].includes(o.status));
  const lifetime = activeOrders.reduce((sum, o) => sum + o.total - o.refund_amount, 0);
  const recent = orders.slice(0, 3);

  return (
    <div className="container-page max-w-5xl py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Account
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Hello, {me?.full_name?.split(" ")[0] ?? "there"}.
          </h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Member since {formatDate(me?.created_at)}
        </p>
      </div>

      {me && !me.email_verified ? (
        <Alert variant="warning" className="mt-6">
          <MailWarning />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Verify <strong>{me.email}</strong> to unlock checkout.
            <Button
              size="sm"
              variant="outline"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
            >
              {resend.isPending ? <Loader2 className="animate-spin" /> : null}
              Resend link
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Orders placed",
            value: String(orders.length),
            icon: Package,
            href: "/account/orders",
          },
          {
            label: "Lifetime value",
            value: formatPaise(lifetime),
            icon: CheckCircle2,
            href: "/account/orders",
          },
          {
            label: "Saved addresses",
            value: "Manage",
            icon: MapPin,
            href: "/account/addresses",
          },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href as never}
            className="group rounded-xl border bg-card p-5 transition-colors hover:border-foreground/25"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {stat.label}
              </p>
              <stat.icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-xl font-semibold tracking-tight">{stat.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent orders</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/account/orders">View all</Link>
            </Button>
          </div>
          {recent.length ? (
            <div className="divide-y rounded-xl border bg-card">
              {recent.map((order) => (
                <Link
                  key={order.id}
                  href={`/account/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
                >
                  <div>
                    <p className="font-mono text-sm">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)} ·{" "}
                      {(order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)} items
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={order.status} />
                    <span className="price-tabular text-sm font-medium">
                      {formatPaise(order.total)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No orders yet.{" "}
              <Link href="/products" className="text-foreground underline-offset-4 hover:underline">
                Start with the collection
              </Link>
              .
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                updateProfile.mutate(name.trim());
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={me?.email ?? ""} readOnly disabled />
                {me?.email_verified ? (
                  <Badge variant="success" className="mt-1">
                    <CheckCircle2 /> Verified
                  </Badge>
                ) : (
                  <Badge variant="warning" className="mt-1">
                    Not verified
                  </Badge>
                )}
              </div>
              <Button type="submit" size="sm" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <Loader2 className="animate-spin" /> : null}
                Save changes
              </Button>
            </form>
          </div>
          <Link
            href="/account/reviews"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm transition-colors hover:border-foreground/25"
          >
            <Star className="size-4 text-muted-foreground" />
            <span className="flex-1">My reviews</span>
            <span className="text-xs text-muted-foreground">View</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
