import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, Star } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = buildMetadata({
  title: "My reviews",
  path: "/account/reviews",
  noIndex: true,
});

export default function ReviewsPage() {
  return (
    <div className="container-page max-w-4xl py-10">
      <div className="border-b pb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">My reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ratings and notes you&apos;ve shared with the community.
        </p>
      </div>

      <EmptyState
        icon={MessageSquareText}
        title="No reviews yet"
        description="Once you've lived with a piece for a while, share what you think on its product page. Reviews appear here for easy reference."
        className="mt-8"
        action={
          <Button asChild>
            <Link href="/account/orders">
              <Star /> Review a purchase
            </Link>
          </Button>
        }
      />

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Tip: open a delivered order to leave a review from the product page.
      </p>
    </div>
  );
}
