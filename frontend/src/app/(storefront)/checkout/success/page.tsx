import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { CheckoutSuccessView } from "@/components/checkout/checkout-success-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = buildMetadata({
  title: "Order confirmed",
  path: "/checkout/success",
  noIndex: true,
});

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page max-w-2xl py-16">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="mt-10 h-56 w-full rounded-xl" />
        </div>
      }
    >
      <CheckoutSuccessView />
    </Suspense>
  );
}
