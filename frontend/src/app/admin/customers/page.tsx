import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { CustomersTable } from "@/components/admin/customers-table";

export const metadata: Metadata = buildMetadata({
  title: "Customers",
  path: "/admin/customers",
  noIndex: true,
});

export default function AdminCustomersPage() {
  return <CustomersTable />;
}
