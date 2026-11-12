import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, PackageX } from "lucide-react";
import { getCategory, getProducts } from "@/lib/server-api";
import { buildMetadata, breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { ProductGrid } from "@/components/storefront/product-grid";
import { Breadcrumbs } from "@/components/storefront/breadcrumbs";
import { JsonLd } from "@/components/shared/json-ld";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { slugToTitle } from "@/lib/utils";
import type { Page, ProductListItem } from "@/lib/types";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  return buildMetadata({
    title: category?.name ?? slugToTitle(slug),
    description: category
      ? `Shop ${category.name.toLowerCase()} at Maison — considered pieces, honest pricing, free shipping over ₹999.`
      : "Browse the Maison collection.",
    path: `/categories/${slug}`,
    image: category?.image_url ?? undefined,
  });
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  let result: Page<ProductListItem> = {
    items: [],
    page: 1,
    page_size: 24,
    total: 0,
    pages: 0,
  };
  let failed = false;
  try {
    result = await getProducts(
      { category: slug, page: 1, page_size: 24, sort: "newest" },
      { revalidate: 300, tags: ["products", `category/${slug}`] },
    );
  } catch {
    failed = true;
  }

  return (
    <div className="container-page py-8 lg:py-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { label: "Home", href: "/" },
            { label: "Shop all", href: "/products" },
            { label: category.name, href: `/categories/${slug}` },
          ]),
          itemListJsonLd(result.items),
        ]}
      />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop all", href: "/products" },
          { label: category.name },
        ]}
        className="mb-6"
      />

      <header className="relative overflow-hidden rounded-2xl border bg-[oklch(0.94_0.02_80)] px-7 py-12 sm:px-12 sm:py-16">
        <div className="relative z-10 max-w-2xl space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Category
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {category.name}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            A focused edit of {category.name.toLowerCase()} — chosen for materials,
            usefulness and staying power.
          </p>
          <p className="text-xs text-muted-foreground">
            {result.total} {result.total === 1 ? "piece" : "pieces"}
          </p>
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-2 text-[12rem] font-semibold leading-none text-foreground/[0.04]"
        >
          {category.name.slice(0, 2).toUpperCase()}
        </span>
      </header>

      <div className="mt-10">
        {result.items.length ? (
          <ProductGrid products={result.items} />
        ) : (
          <EmptyState
            icon={PackageX}
            title={failed ? "Catalogue unavailable" : "This category is being restocked"}
            description={
              failed
                ? "The API didn't respond. Please try again shortly."
                : "Pieces are on their way back. In the meantime, the full collection is open."
            }
            action={
              <Button asChild variant="outline">
                <Link href="/products">
                  Browse everything <ArrowRight />
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
