import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AuditTable } from "@/components/admin/audit-table";

export const metadata: Metadata = buildMetadata({
  title: "Audit log",
  path: "/admin/audit",
  noIndex: true,
});

export default function AdminAuditPage() {
  return <AuditTable />;
}
