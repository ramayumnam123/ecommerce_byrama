import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({
  rating,
  count,
  showCount = true,
  className,
}: {
  rating: number | null | undefined;
  count?: number;
  showCount?: boolean;
  className?: string;
}) {
  const value = rating ?? 0;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="flex" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "size-3.5",
              i < Math.round(value)
                ? "fill-amber-500 text-amber-500"
                : "fill-transparent text-muted-foreground/40",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {value ? value.toFixed(1) : "—"}
        {showCount && count !== undefined ? ` (${count})` : ""}
      </span>
      <span className="sr-only">
        {value ? `Rated ${value.toFixed(1)} out of 5` : "Not yet rated"}
      </span>
    </span>
  );
}
