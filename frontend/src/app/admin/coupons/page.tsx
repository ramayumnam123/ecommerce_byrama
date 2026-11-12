import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { CouponsManager } from "@/components/admin/coupons-manager";

export const metadata: Metadata = buildMetadata({
  title: "Coupons",
  path: "/admin/coupons",
  noIndex: true,
});

export default function AdminCouponsPage() {
  return <CouponsManager />;
}
