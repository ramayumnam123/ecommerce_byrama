"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import type { Page, Review } from "@/lib/types";
import { RatingStars } from "@/components/shared/rating-stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { toastApiError } from "@/lib/errors";

export function ReviewSection({
  slug,
  initial,
  average,
  count,
}: {
  slug: string;
  initial: Page<Review>;
  average: number | null;
  count: number;
}) {
  const [page, setPage] = React.useState(initial.page);

  const query = useQuery({
    queryKey: ["reviews", slug, page],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/products/{slug}/reviews", {
          params: { path: { slug }, query: { page, page_size: 8 } },
        }),
      ),
    initialData: page === initial.page ? initial : undefined,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (query.error) toastApiError(query.error);
  }, [query.error]);

  const data = query.data ?? initial;

  return (
    <section id="reviews" aria-label="Customer reviews" className="scroll-mt-28">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Customer reviews</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RatingStars rating={average} count={count} />
            <span className="text-xs text-muted-foreground">
              {count ? `${count} review${count === 1 ? "" : "s"}` : "No reviews yet"}
            </span>
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="mt-6 space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-2/3 max-w-md" />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews yet"
          description="Reviews from verified buyers appear here after delivery."
          className="mt-6"
        />
      ) : (
        <ul className="mt-2 divide-y">
          {data.items.map((review) => (
            <li key={review.id} className="py-6">
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
              {review.title ? <p className="mt-2 text-sm font-medium">{review.title}</p> : null}
              {review.body ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
                  {review.body}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {data.pages > 1 ? (
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pages || query.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
