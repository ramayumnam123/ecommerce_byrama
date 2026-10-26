import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";

export const metadata: Metadata = buildMetadata({
  title: "Checkout",
  description: "Secure checkout at Maison.",
  path: "/checkout",
  noIndex: true,
});

export default function CheckoutPage() {
  return <CheckoutFlow />;
}
