import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { CartView } from "@/components/storefront/cart-view";

export const metadata: Metadata = buildMetadata({
  title: "Your bag",
  description: "Review the pieces in your bag before checkout.",
  path: "/cart",
  noIndex: true,
});

export default function CartPage() {
  return <CartView />;
}
