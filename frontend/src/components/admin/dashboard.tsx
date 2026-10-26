"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  IndianRupee,
  Package,
  ReceiptText,
  ShoppingBag,
  Users,
} from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { useAnalyticsData } from "@/lib/admin-analytics";
import type { AnalyticsRange } from "@/lib/analytics-range";
import { rangeLabel } from "@/lib/analytics-range";
import { messageForError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { formatNumber, formatPaise } from "@/lib/money";
import type { AdminOrder, Page } from "@/lib/types";
import {
  CategoryDonutChart,
  ChartCard,
  CustomerGrowthChart,
  OrdersBarChart,
  RevenueAreaChart,
  TopProductsChart,
} from "@/components/admin/analytics-charts";
import { KpiCard } from "@/components/admin/kpi-card";
import { PeriodPicker } from "@/components/admin/period-picker";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AdminDashboard() {
  const router = useRouter();
  const [range, setRange] = React.useState<AnalyticsRange>({ period: "30d" });
  const analytics = useAnalyticsData(range);

  const recent = useQuery({
    queryKey: ["admin", "orders", "recent"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/orders", {
          params: { query: { page: 1, page_size: 8 } },
        }),
      ),
  });

  const summary = analytics.summary.data;
  const deltas = summary?.deltas_vs_prev;

  const orderColumns: Column<AdminOrder>[] = [
    {
      key: "order",
      header: "Order",
      cell: (row) => (
        <span className="font-mono text-xs font-medium">{row.order_number}</span>
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
      cell: (row) => <span className="text-xs">{row.item_count}</span>,
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
    {
      key: "placed",
      header: "Placed",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
      ),
    },
  ];

  const lowStockColumns: Column<{ variant_id: string; sku: string; product_name: string; stock: number }>[] =
    [
      {
        key: "product",
        header: "Product",
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.product_name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{row.sku}</p>
          </div>
        ),
      },
      {
        key: "stock",
        header: "On hand",
        className: "text-right",
        headClassName: "text-right",
        cell: (row) => (
          <Badge variant={row.stock === 0 ? "destructive" : "warning"}>
            {row.stock === 0 ? "Sold out" : `${row.stock} left`}
          </Badge>
        ),
      },
    ];

  const revenueError =
    analytics.summary.error ??
    analytics.revenue.error ??
    analytics.topProducts.error ??
    analytics.categories.error ??
    analytics.growth.error;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Store pulse"
        description="Revenue, orders and inventory for the selected window. Figures are live from the paid-order ledger."
        actions={
          <>
            <PeriodPicker value={range} onChange={setRange} />
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/analytics">
                Full analytics <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      {revenueError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{messageForError(revenueError)}</AlertDescription>
        </Alert>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{rangeLabel(range)}</p>
          {analytics.enabled ? null : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Choose both dates for a custom window
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {analytics.summary.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[7.5rem] rounded-xl" />
            ))
          ) : (
            <>
              <KpiCard
                label="Revenue"
                value={formatPaise(summary?.revenue ?? 0)}
                delta={deltas?.revenue}
                icon={IndianRupee}
              />
              <KpiCard
                label="Orders"
                value={formatNumber(summary?.orders_count ?? 0)}
                delta={deltas?.orders_count}
                icon={ShoppingBag}
              />
              <KpiCard
                label="Average order"
                value={formatPaise(summary?.aov ?? 0)}
                delta={deltas?.aov}
                icon={ReceiptText}
              />
              <KpiCard
                label="Units sold"
                value={formatNumber(summary?.units_sold ?? 0)}
                delta={deltas?.units_sold}
                icon={Package}
              />
              <KpiCard
                label="Customers"
                value={formatNumber(summary?.customers ?? 0)}
                delta={deltas?.customers}
                icon={Users}
              />
            </>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue trend"
          description="Net of refunds, by paid date"
          className="lg:col-span-2"
        >
          {analytics.revenue.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <RevenueAreaChart data={analytics.revenue.data ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Orders per day" description="Paid, shipped and delivered">
          {analytics.revenue.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <OrdersBarChart data={analytics.revenue.data ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Top products" description="By revenue in the window">
          {analytics.topProducts.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <TopProductsChart data={analytics.topProducts.data ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Category split" description="Share of net revenue">
          {analytics.categories.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <CategoryDonutChart data={analytics.categories.data ?? []} />
          )}
        </ChartCard>

        <ChartCard
          title="New customers"
          description="Sign-ups by day"
          action={
            <Badge variant="outline">
              <Users /> Growth
            </Badge>
          }
        >
          {analytics.growth.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <CustomerGrowthChart data={analytics.growth.data ?? []} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Recent orders</h2>
              <p className="text-xs text-muted-foreground">Latest activity across the store</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/orders">
                View all <ArrowRight />
              </Link>
            </Button>
          </div>
          <DataTable
            columns={orderColumns}
            rows={(recent.data as Page<AdminOrder> | undefined)?.items ?? []}
            rowKey={(row) => row.id}
            loading={recent.isLoading}
            onRowClick={(row) => router.push(`/admin/orders/${row.id}`)}
            empty="No orders yet."
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Low stock</h2>
              <p className="text-xs text-muted-foreground">Threshold: 5 units</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/products">
                <Boxes /> Manage
              </Link>
            </Button>
          </div>
          <DataTable
            columns={lowStockColumns}
            rows={analytics.lowStock.data ?? []}
            rowKey={(row) => row.variant_id}
            loading={analytics.lowStock.isLoading}
            empty="Everything is comfortably in stock."
          />
        </section>
      </div>
    </div>
  );
}
