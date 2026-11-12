import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AdminDashboard } from "@/components/admin/dashboard";

export const metadata: Metadata = buildMetadata({
  title: "Dashboard",
  path: "/admin",
  noIndex: true,
});

export default function AdminDashboardPage() {
  return <AdminDashboard />;
}
