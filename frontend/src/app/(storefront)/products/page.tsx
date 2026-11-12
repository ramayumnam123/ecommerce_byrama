import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { getCategories, getProducts } from "@/lib/server-api";
import { buildMetadata, itemListJsonLd } from "@/lib/seo";
import type { Category, Page, ProductListItem } from "@/lib/types";
import { FilterSidebar } from "@/components/storefront/filter-sidebar";
import { SortSelect } from "@/components/storefront/sort-select";
import { ProductGrid } from "@/components/storefront/product-grid";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { JsonLd } from "@/components/shared/json-ld";
import { Breadcrumbs } from "@/components/storefront/breadcrumbs";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Shop all",
  description:
    "Browse the full Maison collection — electronics, apparel, accessories and home goods, filtered the way you like.",
  path: "/products",
});

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const params = {
    q: one(raw.q),
    category: one(raw.category),
    min_price: one(raw.min_price),
    max_price: one(raw.max_price),
    color: one(raw.color),
    size: one(raw.size),
    in_stock: one(raw.in_stock) === "true" ? "true" : undefined,
    sort: one(raw.sort) ?? "newest",
    page: one(raw.page) ?? "1",
  };

  const query = {
    q: params.q,
    category: params.category,
    min_price: params.min_price ? Number(params.min_price) : undefined,
    max_price: params.max_price ? Number(params.max_price) : undefined,
    color: params.color,
    size: params.size,
    in_stock: params.in_stock === "true",
    sort: params.sort,
    page: Math.max(1, Number(params.page) || 1),
    page_size: 12,
  };

  let categories: Category[] = [];
  let result: Page<ProductListItem> = {
    items: [],
    page: 1,
    page_size: 12,
    total: 0,
    pages: 0,
  };
  let failed = false;

  try {
    [categories, result] = await Promise.all([
      getCategories(),
      getProducts(query, { noStore: true }),
    ]);
  } catch {
    failed = true;
  }

  const category = categories.find((c) => c.slug === params.category);

  return (
    <div className="container-page py-8 lg:py-10">
      <JsonLd data={itemListJsonLd(result.items)} />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: category?.name ?? "Shop all" },
        ]}
        className="mb-5"
      />

      <header className="border-b pb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {params.q ? `Results for “${params.q}”` : category?.name ?? "The collection"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {failed
            ? "We couldn't reach the catalogue just now. Please refresh in a moment."
            : `${result.total} ${result.total === 1 ? "piece" : "pieces"} · thoughtfully sourced, honestly priced.`}
        </p>
      </header>

      <div className="mt-6 flex gap-10">
        <FilterSidebar categories={categories} params={params} />

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {result.items.length ? (result.page - 1) * result.page_size + 1 : 0}–
                {(result.page - 1) * result.page_size + result.items.length}
              </span>{" "}
              of {result.total}
            </p>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Sort by
              </span>
              <SortSelect value={params.sort} params={params} />
            </div>
          </div>

          {result.items.length ? (
            <>
              <ProductGrid products={result.items} columns={3} />
              <Pagination
                page={result.page}
                pages={result.pages}
                basePath="/products"
                params={params}
                className="mt-12"
              />
            </>
          ) : (
            <EmptyState
              icon={PackageSearch}
              title={failed ? "Catalogue unavailable" : "No matches this time"}
              description={
                failed
                  ? "The API didn't respond. Please try again."
                  : "Try removing a filter or two — the full collection is one click away."
              }
              action={
                <Button asChild variant="outline">
                  <Link href="/products">Clear filters</Link>
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
