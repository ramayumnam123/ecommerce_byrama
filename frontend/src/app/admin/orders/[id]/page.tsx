import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AdminOrderDetailView } from "@/components/admin/order-detail";

export const metadata: Metadata = buildMetadata({
  title: "Order detail",
  path: "/admin/orders",
  noIndex: true,
});

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminOrderDetailView orderId={id} />;
}
