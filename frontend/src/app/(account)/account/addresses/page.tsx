import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AddressesView } from "@/components/account/addresses-view";

export const metadata: Metadata = buildMetadata({
  title: "Addresses",
  path: "/account/addresses",
  noIndex: true,
});

export default function AddressesPage() {
  return <AddressesView />;
}
