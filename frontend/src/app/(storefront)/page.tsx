import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Headphones,
  Leaf,
  RotateCcw,
  Sparkles,
  Truck,
} from "lucide-react";
import { getCategories, getProducts } from "@/lib/server-api";
import { buildMetadata, SITE_NAME, organizationJsonLd } from "@/lib/seo";
import { formatPaise } from "@/lib/money";
import { mediaUrl, cn } from "@/lib/utils";
import { JsonLd } from "@/components/shared/json-ld";
import { ProductGrid } from "@/components/storefront/product-grid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "@/components/shared/rating-stars";
import type { Category, ProductListItem, Page } from "@/lib/types";

export const revalidate = 300;

export const metadata = buildMetadata({
  title: "Considered goods for everyday life",
  description:
    "Shop a tight edit of electronics, apparel, accessories and home goods. Free shipping over ₹999, 14-day returns, secure payments.",
  path: "/",
});

const TILE_TONES = [
  "bg-[oklch(0.93_0.03_75)]",
  "bg-[oklch(0.9_0.02_180)]",
  "bg-[oklch(0.91_0.025_25)]",
  "bg-[oklch(0.92_0.02_120)]",
];

const PROOFS = [
  {
    quote:
      "The merino tee has become the thing I reach for every single week. Quietly excellent.",
    name: "Ananya R.",
    detail: "Verified buyer · Apparel",
    rating: 5,
  },
  {
    quote:
      "Delivery was faster than promised and the packaging felt considered, not wasteful.",
    name: "Karan M.",
    detail: "Verified buyer · Electronics",
    rating: 5,
  },
  {
    quote:
      "A rare shop where the photos undersell the product. The watch feels far more premium than the price.",
    name: "Meera S.",
    detail: "Verified buyer · Accessories",
    rating: 4,
  },
];

export default async function HomePage() {
  let categories: Category[] = [];
  let featured: Page<ProductListItem> = {
    items: [],
    page: 1,
    page_size: 8,
    total: 0,
    pages: 0,
  };

  try {
    [categories, featured] = await Promise.all([
      getCategories(),
      getProducts({ sort: "newest", page: 1, page_size: 8 }),
    ]);
  } catch {
    // The page still renders a graceful shell when the API is unavailable.
  }

  const heroImages = featured.items.slice(0, 3);
  const hero = heroImages[0];
  const second = heroImages[1];
  const third = heroImages[2];

  return (
    <>
      <JsonLd data={organizationJsonLd()} />

      {/* Hero */}
      <section className="border-b">
        <div className="container-page grid gap-10 py-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-20">
          <div className="max-w-2xl space-y-7">
            <Badge variant="outline" className="gap-1.5 px-3 py-1">
              <Sparkles className="size-3" /> The Autumn edit is here
            </Badge>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl">
              Objects for a slower, better everyday.
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
              A tight edit of things worth keeping — considered materials, honest
              pricing, and no filler. {SITE_NAME} stocks only what earns its place.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  Shop the collection <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={categories[0] ? (`/categories/${categories[0].slug}` as Route) : "/products"}>
                  Explore {categories[0]?.name ?? "categories"}
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Truck className="size-4" /> Free shipping over ₹999
              </span>
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw className="size-4" /> 14-day returns
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4" /> Secure checkout
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 grid-rows-[1fr_auto] gap-3">
            <div className="relative col-span-2 aspect-[16/10] overflow-hidden rounded-2xl border bg-muted">
              {hero?.image_url ? (
                <Image
                  src={mediaUrl(hero.image_url)!}
                  alt={hero.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 48vw"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[oklch(0.92_0.03_75)]" />
              )}
              {hero ? (
                <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-xl bg-background/92 px-4 py-3 backdrop-blur">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Editor&apos;s pick
                    </p>
                    <p className="text-sm font-medium">{hero.name}</p>
                  </div>
                  <p className="price-tabular text-sm font-medium">
                    {formatPaise(hero.min_price)}
                  </p>
                </div>
              ) : null}
            </div>
            {[second, third].map((product, index) =>
              product ? (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}` as Route}
                  className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
                >
                  {product.image_url ? (
                    <Image
                      src={mediaUrl(product.image_url)!}
                      alt={product.name}
                      fill
                      sizes="(max-width: 1024px) 45vw, 22vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] backdrop-blur">
                    {index === 0 ? "New in" : "Restocked"}
                  </span>
                </Link>
              ) : (
                <div key={index} className="aspect-square rounded-xl border bg-muted" />
              ),
            )}
          </div>
        </div>
      </section>

      {/* Category tiles */}
      <section className="container-page py-14 lg:py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Browse
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Shop by category
            </h2>
          </div>
          <Link
            href="/products"
            className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            All products <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category, index) => (
            <Link
              key={category.id}
              href={`/categories/${category.slug}` as Route}
              className={cn(
                "group relative flex min-h-44 flex-col justify-between overflow-hidden rounded-xl border p-5 transition-transform hover:-translate-y-0.5",
                TILE_TONES[index % TILE_TONES.length],
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/50">
                0{index + 1}
              </span>
              <div>
                <p className="text-lg font-medium tracking-tight">{category.name}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-foreground/60">
                  Explore <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                </p>
              </div>
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-8 -right-4 text-[7rem] font-semibold leading-none text-foreground/[0.045]"
              >
                {index + 1}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="container-page pb-16">
        <div className="flex items-end justify-between gap-4 border-t pt-12">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Just landed
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              New this week
            </h2>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/products">
              View all <ArrowRight />
            </Link>
          </Button>
        </div>
        <ProductGrid products={featured.items} className="mt-8" />
      </section>

      {/* Value strip */}
      <section className="border-y bg-card">
        <div className="container-page grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Truck, title: "Free shipping", body: "On every order over ₹999, across India." },
            { icon: RotateCcw, title: "14-day returns", body: "Changed your mind? Send it back, no drama." },
            { icon: Leaf, title: "Considered materials", body: "Lower-impact fabrics and repairable electronics." },
            { icon: Headphones, title: "Real support", body: "Humans reply within one business day." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-background">
                <item.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof */}
      <section className="container-page py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Word of mouth
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Bought once. Kept for years.
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              We&apos;d rather earn a repeat customer than a one-off sale. Here&apos;s what
              people say after living with the collection.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <div className="flex -space-x-2">
                {["AR", "KM", "MS", "DV"].map((initials) => (
                  <span
                    key={initials}
                    className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-accent text-[10px] font-semibold"
                  >
                    {initials}
                  </span>
                ))}
              </div>
              <div>
                <RatingStars rating={4.8} showCount={false} />
                <p className="text-[11px] text-muted-foreground">from 1,200+ verified orders</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROOFS.map((proof, index) => (
              <figure
                key={proof.name}
                className={cn(
                  "flex flex-col justify-between gap-5 rounded-xl border bg-card p-5",
                  index === 0 && "sm:row-span-2 sm:justify-start",
                )}
              >
                <div className="space-y-3">
                  <RatingStars rating={proof.rating} showCount={false} />
                  <blockquote className="text-sm leading-relaxed text-pretty">
                    “{proof.quote}”
                  </blockquote>
                </div>
                <figcaption className="text-xs">
                  <span className="font-medium">{proof.name}</span>
                  <span className="block text-muted-foreground">{proof.detail}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Editorial band */}
      <section className="container-page pb-20">
        <div className="relative overflow-hidden rounded-2xl border bg-[oklch(0.24_0.02_60)] px-7 py-12 text-[oklch(0.97_0.01_85)] sm:px-12 sm:py-16">
          <span className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full border border-white/10" />
          <span className="pointer-events-none absolute -bottom-16 right-20 size-64 rounded-full border border-white/10" />
          <div className="relative max-w-2xl space-y-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">
              The standard
            </p>
            <h2 className="text-2xl font-medium tracking-tight text-balance sm:text-4xl">
              Buy less. Choose well. Make it last.
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-white/65">
              Every product is evaluated on materials, repairability and the
              people who make it. If it doesn&apos;t pass, it doesn&apos;t ship.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-[oklch(0.97_0.01_85)] text-[oklch(0.2_0.02_60)] hover:bg-white"
            >
              <Link href="/products">
                See what made the cut <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
