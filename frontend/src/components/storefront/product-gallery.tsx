"use client";

import * as React from "react";
import Image from "next/image";
import { cn, mediaUrl } from "@/lib/utils";
import type { ProductImage } from "@/lib/types";

export function ProductGallery({
  images,
  name,
}: {
  images: ProductImage[];
  name: string;
}) {
  const [active, setActive] = React.useState(0);
  const list = images.length ? images : [];
  const current = list[Math.min(active, list.length - 1)];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted">
        {current ? (
          <Image
            key={current.url}
            src={mediaUrl(current.url)!}
            alt={current.alt_text || name}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
      </div>
      {list.length > 1 ? (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Product images">
          {list.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show image ${index + 1}`}
              aria-pressed={active === index}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border transition-all",
                active === index
                  ? "ring-2 ring-[oklch(0.58_0.12_48)] ring-offset-2 ring-offset-background"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              <Image
                src={mediaUrl(image.url)!}
                alt={image.alt_text || `${name} thumbnail ${index + 1}`}
                fill
                sizes="120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
