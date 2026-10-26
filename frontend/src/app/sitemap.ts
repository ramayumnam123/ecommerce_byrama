import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/server-api";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/cart`, changeFrequency: "never", priority: 0.2 },
    { url: `${SITE_URL}/signin`, changeFrequency: "never", priority: 0.2 },
    { url: `${SITE_URL}/signup`, changeFrequency: "never", priority: 0.2 },
  ];

  try {
    const [categories, products] = await Promise.all([
      getCategories(),
      collectProducts(),
    ]);

    return [
      ...staticRoutes,
      ...categories.map((category) => ({
        url: `${SITE_URL}/categories/${category.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...products.map((product) => ({
        url: `${SITE_URL}/products/${product.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // The API may be down at build time — still emit the static shell.
    return staticRoutes;
  }
}

async function collectProducts() {
  const items: Awaited<ReturnType<typeof getProducts>>["items"] = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await getProducts({ page, page_size: 100 }, { revalidate: 3600 });
    items.push(...result.items);
    pages = result.pages;
    page += 1;
  } while (page <= pages && page <= 20);
  return items;
}
