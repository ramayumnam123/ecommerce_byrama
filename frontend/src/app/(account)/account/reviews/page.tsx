import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MyReviewsList } from "@/components/account/my-reviews-list";

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

      <MyReviewsList />
    </div>
  );
}
