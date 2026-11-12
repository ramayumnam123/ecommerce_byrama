import Link from "next/link";
import type { Route } from "next";
import { Star } from "lucide-react";
import type { Review } from "@/lib/types";
import { RatingStars } from "@/components/shared/rating-stars";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export function ReviewList({
  reviews,
  page,
  pages,
  average,
  count,
  slug,
  basePath,
  className,
}: {
  reviews: Review[];
  page: number;
  pages: number;
  average: number | null;
  count: number;
  slug: string;
  basePath?: string;
  className?: string;
}) {
  return (
    <section className={cn("space-y-6", className)} id="reviews" aria-label="Customer reviews">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Customer reviews</h2>
          <div className="mt-1 flex items-center gap-2">
            <RatingStars rating={average} count={count} />
            <span className="text-xs text-muted-foreground">
              {count ? `${count} review${count === 1 ? "" : "s"}` : "Be the first to review"}
            </span>
          </div>
        </div>
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews yet"
          description="Reviews from verified buyers will appear here after delivery."
        />
      ) : (
        <ul className="space-y-6">
          {reviews.map((review) => (
            <li key={review.id} className="border-b pb-6 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{review.user_name}</span>
                {review.is_verified_purchase ? (
                  <Badge variant="success">Verified purchase</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatDate(review.created_at)}
                </span>
              </div>
              <div className="mt-1.5">
                <RatingStars rating={review.rating} showCount={false} />
              </div>
              {review.title ? (
                <p className="mt-2 text-sm font-medium">{review.title}</p>
              ) : null}
              {review.body ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
                  {review.body}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" asChild disabled={page <= 1}>
            <Link
              href={`${basePath ?? `/products/${slug}`}?review_page=${Math.max(1, page - 1)}#reviews` as Route}
              aria-disabled={page <= 1}
            >
              Previous
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" asChild disabled={page >= pages}>
            <Link
              href={`${basePath ?? `/products/${slug}`}?review_page=${Math.min(pages, page + 1)}#reviews` as Route}
              aria-disabled={page >= pages}
            >
              Next
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
