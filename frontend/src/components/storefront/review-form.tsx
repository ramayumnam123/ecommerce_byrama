"use client";

import * as React from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { toastApiError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Write-a-review form for the product page (docs/04 §4).
 * Signed-in users can post once per product; resubmitting updates their
 * review (server upserts). Guests get a sign-in prompt instead.
 */
export function ReviewForm({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [rating, setRating] = React.useState(0);
  const [hovered, setHovered] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);

  if (!ready) return null;

  if (!user) {
    return (
      <div className={cn("rounded-lg border bg-muted/40 p-4", className)}>
        <p className="text-sm text-muted-foreground">
          Have you used this piece?{" "}
          <Link
            href={`/signin?next=${encodeURIComponent(window.location.pathname)}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to leave a review.
        </p>
      </div>
    );
  }

  const active = hovered || rating;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      toast.error("Pick a star rating first");
      return;
    }
    setPending(true);
    try {
      await unwrap(
        await api.POST("/api/products/{slug}/reviews", {
          params: { path: { slug } },
          body: {
            rating,
            title: title.trim() || null,
            body: body.trim() || null,
          },
        }),
      );
      toast.success("Thanks! Your review has been saved.", {
        description: "Submitting again updates your existing review.",
      });
      await queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
    } catch (error) {
      toastApiError(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className={cn("space-y-4 rounded-lg border p-5", className)}
      aria-label="Write a review"
    >
      <div>
        <Label htmlFor="review-rating">Your rating</Label>
        <div
          id="review-rating"
          role="radiogroup"
          aria-label="Star rating"
          className="mt-1.5 flex gap-1"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              disabled={pending}
              onMouseEnter={() => setHovered(value)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(value)}
              className="rounded-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                className={cn(
                  "size-5 transition-colors",
                  value <= active
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/50",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-title">Title</Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sum it up in a few words"
          maxLength={140}
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-body">Your review</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you like or dislike? How does it hold up in daily use?"
          rows={4}
          maxLength={5000}
          disabled={pending}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Verified-purchase reviews get a badge after delivery.
        </p>
        <Button type="submit" disabled={pending || !rating}>
          {pending ? "Saving…" : "Submit review"}
        </Button>
      </div>
    </form>
  );
}
