import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  getAllProducts,
  getProduct,
  getProducts,
  getReviews,
} from "@/lib/server-api";
import {
  breadcrumbJsonLd,
  buildMetadata,
  productJsonLd,
} from "@/lib/seo";
import { mediaUrl } from "@/lib/utils";
import type { Page, ProductListItem, Review } from "@/lib/types";
import { JsonLd } from "@/components/shared/json-ld";
import { Breadcrumbs } from "@/components/storefront/breadcrumbs";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { AddToCart } from "@/components/storefront/add-to-cart";
import { RatingStars } from "@/components/shared/rating-stars";
import { ReviewSection } from "@/components/storefront/review-section";
import { ProductGrid } from "@/components/storefront/product-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const products = await getAllProducts();
    return products.map((product) => ({ slug: product.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    return buildMetadata({ title: "Product not found", path: `/products/${slug}`, noIndex: true });
  }
  const description =
    product.description.length > 155
      ? `${product.description.slice(0, 152)}…`
      : product.description;
  return buildMetadata({
    title: product.name,
    description,
    path: `/products/${slug}`,
    image: product.images[0] ? mediaUrl(product.images[0].url) : undefined,
  });
}

const EMPTY_REVIEWS: Page<Review> = {
  items: [],
  page: 1,
  page_size: 8,
  total: 0,
  pages: 0,
};

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [reviews, related] = await Promise.all([
    getReviews(slug, 1, 8).catch(() => EMPTY_REVIEWS),
    getProducts(
      {
        category: product.category_slug ?? undefined,
        page: 1,
        page_size: 5,
        sort: "newest",
      },
      { revalidate: 300, tags: ["products", `product/${slug}`] },
    ).catch(
      (): Page<ProductListItem> => ({
        items: [],
        page: 1,
        page_size: 5,
        total: 0,
        pages: 0,
      }),
    ),
  ]);

  const relatedItems = related.items.filter((p) => p.slug !== slug).slice(0, 4);
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Shop all", href: "/products" },
    ...(product.category_slug
      ? [
          {
            label: product.category_slug.replace(/-/g, " "),
            href: `/categories/${product.category_slug}`,
          },
        ]
      : []),
    { label: product.name },
  ];

  return (
    <div className="container-page py-8 lg:py-10">
      <JsonLd
        data={[
          productJsonLd(product, reviews.items),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <Breadcrumbs items={crumbs} className="mb-6 capitalize" />

      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <ProductGallery images={product.images} name={product.name} />

        <div className="lg:pt-2">
          <div className="space-y-4">
            {product.category_slug ? (
              <Link
                href={`/categories/${product.category_slug}`}
                className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                {product.category_slug.replace(/-/g, " ")}
              </Link>
            ) : null}
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {product.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <RatingStars
                rating={product.rating.average}
                count={product.rating.count}
              />
              {product.rating.count > 0 ? (
                <Link
                  href="#reviews"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Read reviews
                </Link>
              ) : null}
              {product.in_stock ? (
                <Badge variant="success">In stock</Badge>
              ) : (
                <Badge variant="secondary">Sold out</Badge>
              )}
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">
              {product.description}
            </p>
          </div>

          <Separator className="my-6" />

          <AddToCart product={product} />

          <div className="mt-8 divide-y rounded-xl border bg-card">
            <details className="group px-5 py-4" open>
              <summary className="cursor-pointer list-none text-sm font-medium">
                Details
                <span className="float-right text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
                {product.variants.length ? (
                  <p className="text-xs">
                    {product.variants.length} variant
                    {product.variants.length === 1 ? "" : "s"} available
                    {product.variants.some((v) => v.sku)
                      ? ` · SKU ${product.variants[0].sku}`
                      : ""}
                  </p>
                ) : null}
              </div>
            </details>
            <details className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium">
                Shipping & returns
                <span className="float-right text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Ships within 1–2 business days. Free shipping over ₹999, otherwise a
                flat ₹99. Returns accepted within 14 days of delivery in original
                condition.
              </p>
            </details>
            <details className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium">
                Care & materials
                <span className="float-right text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Follow the care label. We choose materials for longevity and
                repairability; contact support for spare parts where available.
              </p>
            </details>
          </div>
        </div>
      </div>

      <div className="mt-16 border-t pt-12">
        <ReviewSection
          slug={slug}
          initial={reviews}
          average={product.rating.average ?? null}
          count={product.rating.count}
        />
      </div>

      {relatedItems.length ? (
        <section className="mt-16 border-t pt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Pairs well with
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                You may also like
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/products">
                View all <ArrowRight />
              </Link>
            </Button>
          </div>
          <ProductGrid products={relatedItems} className="mt-8" />
        </section>
      ) : null}
    </div>
  );
}
