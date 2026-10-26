import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { ProductEditor } from "@/components/admin/product-form";

export const metadata: Metadata = buildMetadata({
  title: "New product",
  path: "/admin/products/new",
  noIndex: true,
});

export default function NewProductPage() {
  return <ProductEditor />;
}
