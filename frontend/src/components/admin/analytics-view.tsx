"use client";

import * as React from "react";
import { AlertTriangle, Download, IndianRupee, Package, ReceiptText, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import { useAnalyticsData } from "@/lib/admin-analytics";
import { rangeLabel, type AnalyticsRange } from "@/lib/analytics-range";
import { downloadCsv } from "@/lib/format";
import { messageForError } from "@/lib/errors";
import { formatNumber, formatPaise } from "@/lib/money";
import { KpiCard } from "@/components/admin/kpi-card";
import { PeriodPicker } from "@/components/admin/period-picker";
import {
  CategoryDonutChart,
  ChartCard,
  CustomerGrowthChart,
  OrdersBarChart,
  RevenueAreaChart,
  TopProductsChart,
} from "@/components/admin/analytics-charts";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SalesByCategory, TopProduct } from "@/lib/types";

export function AnalyticsView() {
  const [range, setRange] = React.useState<AnalyticsRange>({ period: "30d" });
  const [cumulative, setCumulative] = React.useState(false);
  const data = useAnalyticsData(range);

  const summary = data.summary.data;
  const deltas = summary?.deltas_vs_prev;

  const error =
    data.summary.error ??
    data.revenue.error ??
    data.topProducts.error ??
    data.categories.error ??
    data.growth.error;

  function exportRows(
    label: string,
    filename: string,
    rows: Record<string, unknown>[],
  ) {
    if (!rows.length) {
      toast.message("Nothing to export", { description: "No data in this window yet." });
      return;
    }
    downloadCsv(filename, rows);
    toast.success(`${label} exported`);
  }

  const topColumns: Column<TopProduct>[] = [
    {
      key: "name",
      header: "Product",
      cell: (row) => <span className="text-sm">{row.name}</span>,
    },
    {
      key: "units",
      header: "Units",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => <span className="text-sm">{formatNumber(row.units)}</span>,
    },
    {
      key: "revenue",
      header: "Revenue",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <span className="price-tabular text-sm font-medium">{formatPaise(row.revenue)}</span>
      ),
    },
  ];

  const categoryColumns: Column<SalesByCategory>[] = [
    {
      key: "category",
      header: "Category",
      cell: (row) => <span className="text-sm">{row.category}</span>,
    },
    {
      key: "share",
      header: "Share",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--color-chart-1)]"
              style={{ width: `${Math.min(100, row.share)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{row.share.toFixed(1)}%</span>
        </div>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <span className="price-tabular text-sm font-medium">{formatPaise(row.revenue)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Commercial insight"
        description="Revenue, conversion proxies and customer growth. Charts use integer paise and format for display only."
        actions={
          <>
            <PeriodPicker value={range} onChange={setRange} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download /> Export CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    exportRows(
                      "Revenue series",
                      `revenue-${range.period}.csv`,
                      (data.revenue.data ?? []).map((row) => ({
                        date: row.date,
                        revenue_inr: (row.revenue / 100).toFixed(2),
                        orders: row.orders,
                      })),
                    )
                  }
                >
                  Revenue by day
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    exportRows(
                      "Top products",
                      `top-products-${range.period}.csv`,
                      (data.topProducts.data ?? []).map((row) => ({
                        product: row.name,
                        units: row.units,
                        revenue_inr: (row.revenue / 100).toFixed(2),
                      })),
                    )
                  }
                >
                  Top products
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    exportRows(
                      "Category split",
                      `categories-${range.period}.csv`,
                      (data.categories.data ?? []).map((row) => ({
                        category: row.category,
                        revenue_inr: (row.revenue / 100).toFixed(2),
                        share_percent: row.share,
                      })),
                    )
                  }
                >
                  Category split
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    exportRows(
                      "Customer growth",
                      `customers-${range.period}.csv`,
                      (data.growth.data ?? []).map((row) => ({
                        date: row.date,
                        new_customers: row.new_customers,
                        cumulative: row.cumulative,
                      })),
                    )
                  }
                >
                  Customer growth
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{rangeLabel(range)}</Badge>
        <span>Deltas compare the equal-length preceding window.</span>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{messageForError(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.summary.isLoading ? (
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

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue trend"
          description="Net revenue by paid date"
          className="lg:col-span-2"
        >
          {data.revenue.isLoading ? (
            <Skeleton className="h-72 w-full rounded-lg" />
          ) : (
            <RevenueAreaChart data={data.revenue.data ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Orders per day" description="Volume across the window">
          {data.revenue.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <OrdersBarChart data={data.revenue.data ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Top products" description="Top 8 by revenue">
          {data.topProducts.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <TopProductsChart data={data.topProducts.data ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Category split" description="Share of net revenue">
          {data.categories.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <CategoryDonutChart data={data.categories.data ?? []} />
          )}
        </ChartCard>

        <ChartCard
          title="Customer growth"
          description="Daily sign-ups and running total"
          action={
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <Button
                size="sm"
                variant={cumulative ? "ghost" : "default"}
                className="h-7 px-2 text-[11px]"
                onClick={() => setCumulative(false)}
              >
                Daily
              </Button>
              <Button
                size="sm"
                variant={cumulative ? "default" : "ghost"}
                className="h-7 px-2 text-[11px]"
                onClick={() => setCumulative(true)}
              >
                Cumulative
              </Button>
            </div>
          }
        >
          {data.growth.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <CustomerGrowthChart data={data.growth.data ?? []} cumulative={cumulative} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Product leaderboard</h2>
          <DataTable
            columns={topColumns}
            rows={data.topProducts.data ?? []}
            rowKey={(row) => row.product_id}
            loading={data.topProducts.isLoading}
            empty="No product revenue in this window."
          />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Category performance</h2>
          <DataTable
            columns={categoryColumns}
            rows={data.categories.data ?? []}
            rowKey={(row) => row.category}
            loading={data.categories.isLoading}
            empty="No category revenue in this window."
          />
        </section>
      </div>
    </div>
  );
}
