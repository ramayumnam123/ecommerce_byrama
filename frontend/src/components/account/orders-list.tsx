"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, ReceiptText } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import type { Page, Order } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { messageForError } from "@/lib/errors";

const PAGE_SIZE = 8;

export function OrdersList() {
  const [page, setPage] = React.useState(1);

  const query = useQuery({
    queryKey: ["orders", page],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/orders", {
          params: { query: { page, page_size: PAGE_SIZE } },
        }),
      ),
  });

  const data = query.data as Page<Order> | undefined;

  return (
    <div className="container-page max-w-4xl py-10">
      <div className="border-b pb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track deliveries, download receipts and start a return.
        </p>
      </div>

      {query.isLoading ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : query.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
      ) : data?.items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No orders yet"
          description="When you place an order it will appear here with live status."
          className="mt-8"
          action={
            <Button asChild>
              <Link href="/products">Shop the collection</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {data?.items.map((order) => (
              <Link
                key={order.id}
                href={`/account/orders/${order.id}`}
                className="block rounded-xl border bg-card p-5 transition-colors hover:border-foreground/25"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-medium">{order.order_number}</p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Placed {formatDate(order.created_at)} ·{" "}
                      {(order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)} items
                    </p>
                    <p className="line-clamp-1 text-sm">
                      {(order.items ?? []).map((item) => item.product_name).join(", ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="price-tabular text-base font-semibold">
                      {formatPaise(order.total)}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ReceiptText className="size-3.5" /> View details
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {data && data.pages > 1 ? (
            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {data.page} of {data.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
