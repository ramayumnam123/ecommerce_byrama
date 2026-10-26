import type { Metadata } from "next";
import type {
  BreadcrumbItem,
  ProductDetail,
  ProductListItem,
  Review,
} from "./types";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
export const SITE_NAME = "Maison";
const DEFAULTS = "Considered goods for everyday life.";

type SeoInput = {
  title?: string;
  description?: string;
  path?: string;
  image?: string | null;
  type?: "website" | "article";
  noIndex?: boolean;
};

export function buildMetadata({
  title,
  description = DEFAULTS,
  path = "/",
  image,
  type = "website",
  noIndex = false,
}: SeoInput): Metadata {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — ${DEFAULTS}`;
  const url = `${SITE_URL}${path}`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      images: image ? [{ url: image, alt: title ?? SITE_NAME }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function productJsonLd(product: ProductDetail, reviews?: Review[]) {
  const inStock = product.variants.some((v) => v.stock > 0);
  const prices = product.variants.map((v) => v.price);
  const low = prices.length ? Math.min(...prices) : product.min_price;
  const high = prices.length ? Math.max(...prices) : product.min_price;

  const aggregate =
    product.rating.count > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: product.rating.average ?? 0,
          reviewCount: product.rating.count,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((i) => i.url),
    sku: product.variants[0]?.sku,
    brand: { "@type": "Brand", name: SITE_NAME },
    aggregateRating: aggregate,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/products/${product.slug}`,
      priceCurrency: "INR",
      price: (low / 100).toFixed(2),
      priceValidUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      ...(high !== low ? { priceSpecification: { "@type": "PriceSpecification", minPrice: (low / 100).toFixed(2), maxPrice: (high / 100).toFixed(2), priceCurrency: "INR" } } : {}),
    },
    review: reviews?.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.user_name },
      datePublished: r.created_at?.slice(0, 10),
      name: r.title ?? undefined,
      reviewBody: r.body ?? undefined,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
    })),
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${SITE_URL}${item.href}` : undefined,
    })),
  };
}

export function itemListJsonLd(products: ProductListItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/products/${product.slug}`,
      name: product.name,
    })),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
  };
}
