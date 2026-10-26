import type { Category, Page, ProductDetail, ProductListItem, Review } from "./types";

/**
 * RSC data access (docs/07 §3). Storefront SEO pages use Next's fetch cache
 * with tags so POST /api/revalidate can purge them; filtered catalog pages
 * are per-request (`cache: "no-store"`).
 */
const SERVER_API = (
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000/api"
).replace(/\/$/, "");

type FetchOptions = {
  revalidate?: number;
  tags?: string[];
  noStore?: boolean;
};

async function serverGet<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    headers: { Accept: "application/json" },
  };
  if (options.noStore) {
    init.cache = "no-store";
  } else if (options.revalidate !== undefined) {
    init.next = { revalidate: options.revalidate, tags: options.tags };
  } else {
    init.next = { revalidate: 300, tags: options.tags };
  }

  const res = await fetch(`${SERVER_API}${path}`, init);
  if (!res.ok) {
    throw new Error(`API ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export type CatalogQuery = {
  q?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  color?: string;
  size?: string;
  in_stock?: boolean;
  sort?: string;
  page?: number;
  page_size?: number;
};

export function catalogQueryString(query: CatalogQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === false) return;
    params.set(key, String(value));
  });
  return params.toString();
}

export async function getCategories(): Promise<Category[]> {
  return serverGet<Category[]>("/categories", {
    revalidate: 300,
    tags: ["categories"],
  });
}

export async function getCategory(slug: string): Promise<Category | null> {
  try {
    return await serverGet<Category>(`/categories/${encodeURIComponent(slug)}`, {
      revalidate: 300,
      tags: ["categories", `category/${slug}`],
    });
  } catch {
    return null;
  }
}

export async function getProducts(
  query: CatalogQuery,
  options: FetchOptions = {},
): Promise<Page<ProductListItem>> {
  const qs = catalogQueryString(query);
  return serverGet<Page<ProductListItem>>(`/products${qs ? `?${qs}` : ""}`, {
    tags: ["products"],
    ...options,
  });
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  try {
    return await serverGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
      revalidate: 300,
      tags: ["products", `product/${slug}`],
    });
  } catch {
    return null;
  }
}

export async function getReviews(
  slug: string,
  page = 1,
  pageSize = 10,
): Promise<Page<Review>> {
  return serverGet<Page<Review>>(
    `/products/${encodeURIComponent(slug)}/reviews?page=${page}&page_size=${pageSize}`,
    { tags: ["reviews", `product/${slug}`] },
  );
}

/** All product slugs for sitemap + generateStaticParams. */
export async function getAllProducts(pageSize = 100): Promise<ProductListItem[]> {
  const page = await getProducts({ page: 1, page_size: pageSize }, { revalidate: 300 });
  return page.items;
}
