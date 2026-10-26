import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { ProductsTable } from "@/components/admin/products-table";

export const metadata: Metadata = buildMetadata({
  title: "Products",
  path: "/admin/products",
  noIndex: true,
});

export default function AdminProductsPage() {
  return <ProductsTable />;
}
