import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { CategoriesManager } from "@/components/admin/categories-manager";

export const metadata: Metadata = buildMetadata({
  title: "Categories",
  path: "/admin/categories",
  noIndex: true,
});

export default function AdminCategoriesPage() {
  return <CategoriesManager />;
}
