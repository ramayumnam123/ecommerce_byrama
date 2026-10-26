import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { OrdersTable } from "@/components/admin/orders-table";

export const metadata: Metadata = buildMetadata({
  title: "Orders",
  path: "/admin/orders",
  noIndex: true,
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <OrdersTable initialQuery={q ?? ""} />;
}
