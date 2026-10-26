import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SettingsView } from "@/components/admin/settings-view";

export const metadata: Metadata = buildMetadata({
  title: "Settings",
  path: "/admin/settings",
  noIndex: true,
});

export default function AdminSettingsPage() {
  return <SettingsView />;
}
