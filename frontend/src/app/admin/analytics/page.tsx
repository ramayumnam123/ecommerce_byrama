import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AnalyticsView } from "@/components/admin/analytics-view";

export const metadata: Metadata = buildMetadata({
  title: "Analytics",
  path: "/admin/analytics",
  noIndex: true,
});

export default function AdminAnalyticsPage() {
  return <AnalyticsView />;
}
