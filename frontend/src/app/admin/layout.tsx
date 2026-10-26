import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = buildMetadata({
  title: "Admin",
  path: "/admin",
  noIndex: true,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
