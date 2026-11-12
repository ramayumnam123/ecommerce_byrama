"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Search, ShoppingBag } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { formatNumber, formatPaise } from "@/lib/money";
import type { AdminOrder, Page } from "@/lib/types";
import { ORDER_STATUSES } from "@/lib/types";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

export function OrdersTable({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");
  const [search, setSearch] = React.useState(initialQuery);
  const [query, setQuery] = React.useState(initialQuery);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const orders = useQuery({
    queryKey: ["admin", "orders", { page, status, query, dateFrom, dateTo }],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/orders", {
          params: {
            query: {
              page,
              page_size: ADMIN_PAGE_SIZE,
              status: status || undefined,
              q: query || undefined,
              date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
              date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
            },
          },
        }),
      ),
  });

  const data = orders.data as Page<AdminOrder> | undefined;

  const hasFilters = !!(status || query || dateFrom || dateTo);

  const columns: Column<AdminOrder>[] = [
    {
      key: "order",
      header: "Order",
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-medium">{row.order_number}</p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(row.created_at)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.user.full_name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.user.email}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "items",
      header: "Items",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => <span className="text-xs">{row.item_count}</span>,
    },
    {
      key: "payment",
      header: "Payment",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted-foreground">
            {row.paid_at ? "Captured" : row.status === "PENDING" ? "Awaiting" : "—"}
          </span>
          {row.refund_amount > 0 ? (
            <Badge variant="secondary" className="w-fit gap-0.5">
              <RotateCcw className="size-2.5" /> {formatPaise(row.refund_amount)}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <span className="price-tabular text-sm font-medium">{formatPaise(row.total)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Commerce"
        title="Orders"
        description="Fulfilment queue with status, search and date filters. Server state-machine rules gate every action."
      />

      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_150px_150px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="order-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="order-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order number or customer email…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-status">Status</Label>
          <Select
            id="order-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-from">From</Label>
          <Input
            id="order-from"
            type="date"
            value={dateFrom}
            max={dateTo || new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-to">To</Label>
          <Input
            id="order-to"
            type="date"
            value={dateTo}
            min={dateFrom}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            disabled={!hasFilters}
            onClick={() => {
              setStatus("");
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {orders.error ? (
        <Alert variant="destructive">
          <AlertDescription>{messageForError(orders.error)}</AlertDescription>
        </Alert>
      ) : null}

      {!orders.isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders match"
          description={
            hasFilters
              ? "Try removing a filter or widening the date range."
              : "Orders will appear here as soon as customers check out."
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(row) => row.id}
            loading={orders.isLoading}
            onRowClick={(row) => router.push(`/admin/orders/${row.id}`)}
            empty="No orders."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data ? `${formatNumber(data.total)} order${data.total === 1 ? "" : "s"}` : "—"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {data?.page ?? 1} of {data?.pages ?? 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
