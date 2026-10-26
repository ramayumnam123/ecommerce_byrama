import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { ProductEditor } from "@/components/admin/product-form";

export const metadata: Metadata = buildMetadata({
  title: "Edit product",
  path: "/admin/products",
  noIndex: true,
});

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductEditor productId={id} />;
}
