"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Star } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { RatingStars } from "@/components/shared/rating-stars";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { messageForError } from "@/lib/errors";

type MyReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  created_at: string;
  product_slug: string;
  product_name: string;
};

export function MyReviewsList() {
  const query = useQuery({
    queryKey: ["my-reviews"],
    queryFn: async () =>
      unwrap(await api.GET("/api/users/reviews", { params: { query: {} } })),
  });

  const data = query.data;

  return (
    <div>
      {query.isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : query.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
      ) : data?.items.length === 0 ? (
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
      ) : (
        <ul className="mt-6 space-y-3">
          {data?.items.map((review: MyReview) => (
            <li key={review.id}>
              <Link
                href={`/products/${review.product_slug}#reviews`}
                className="block rounded-xl border bg-card p-5 transition-colors hover:border-foreground/25"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {review.product_name}
                    </span>
                    {review.is_verified_purchase ? (
                      <Badge variant="success" className="ml-2">
                        Verified purchase
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(review.created_at)}
                  </span>
                </div>
                <div className="mt-2">
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
                <span className="mt-3 inline-block text-xs text-muted-foreground underline underline-offset-4">
                  View on product page
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Tip: open a delivered order to leave a review from the product page.
      </p>
    </div>
  );
}
