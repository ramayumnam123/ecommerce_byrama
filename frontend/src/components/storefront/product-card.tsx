import Link from "next/link";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import type { ProductListItem } from "@/lib/types";
import { mediaUrl } from "@/lib/utils";
import { Price } from "@/components/shared/price";
import { RatingStars } from "@/components/shared/rating-stars";
import { Badge } from "@/components/ui/badge";

export function ProductCard({
  product,
  priority = false,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  product: ProductListItem;
  priority?: boolean;
  sizes?: string;
}) {
  const image = mediaUrl(product.image_url);
  const lowStock = product.in_stock && product.total_stock <= 5;

  return (
    <article className="group">
      <Link
        href={`/products/${product.slug}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-muted">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              priority={priority}
              sizes={sizes}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-6" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {!product.in_stock ? (
              <Badge variant="secondary" className="bg-background/90 backdrop-blur">
                Sold out
              </Badge>
            ) : lowStock ? (
              <Badge variant="warning" className="bg-background/90 backdrop-blur">
                Low stock
              </Badge>
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span className="block rounded-md bg-background/95 px-3 py-2 text-center text-xs font-medium shadow-sm backdrop-blur">
              View details
            </span>
          </div>
        </div>
      </Link>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/products/${product.slug}`}
            className="line-clamp-1 text-sm font-medium tracking-tight hover:underline"
          >
            {product.name}
          </Link>
          <Price
            value={product.min_price}
            compareAt={product.compare_at_price}
            size="sm"
            className="shrink-0 justify-end"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <RatingStars
            rating={product.rating.average}
            count={product.rating.count}
            showCount={product.rating.count > 0}
          />
          {product.category_slug ? (
            <span className="text-[11px] capitalize text-muted-foreground">
              {product.category_slug.replace(/-/g, " ")}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
