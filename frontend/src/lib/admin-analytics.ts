"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { isRangeReady, rangeQuery, type AnalyticsRange } from "./analytics-range";

/** Shared analytics query bundle for the dashboard and the analytics screen. */
export function useAnalyticsData(range: AnalyticsRange) {
  const query = rangeQuery(range);
  const enabled = isRangeReady(range);

  const summary = useQuery({
    queryKey: ["admin", "analytics", "summary", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/analytics/summary", { params: { query } }),
      ),
    enabled,
  });

  const revenue = useQuery({
    queryKey: ["admin", "analytics", "revenue", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/analytics/revenue-by-day", {
          params: { query },
        }),
      ),
    enabled,
  });

  const topProducts = useQuery({
    queryKey: ["admin", "analytics", "top-products", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/analytics/top-products", { params: { query } }),
      ),
    enabled,
  });

  const categories = useQuery({
    queryKey: ["admin", "analytics", "categories", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/analytics/sales-by-category", {
          params: { query },
        }),
      ),
    enabled,
  });

  const growth = useQuery({
    queryKey: ["admin", "analytics", "growth", query],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/analytics/customer-growth", {
          params: { query },
        }),
      ),
    enabled,
  });

  const lowStock = useQuery({
    queryKey: ["admin", "analytics", "low-stock"],
    queryFn: async () =>
      unwrap(await api.GET("/api/admin/analytics/low-stock")),
  });

  return { summary, revenue, topProducts, categories, growth, lowStock, enabled };
}
