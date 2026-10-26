"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { SlidersHorizontal, X } from "lucide-react";
import type { Category } from "@/lib/types";
import { COLOR_FACETS, PRICE_BANDS, SIZE_FACETS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type Params = Record<string, string | undefined>;

function FilterContent({
  categories,
  params,
}: {
  categories: Category[];
  params: Params;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState(params.q ?? "");

  const apply = (patch: Params) => {
    const next = new URLSearchParams();
    const merged = { ...params, ...patch };
    Object.entries(merged).forEach(([key, value]) => {
      if (key === "page") return;
      if (value) next.set(key, value);
    });
    startTransition(() => {
      router.push(`/products${next.toString() ? `?${next.toString()}` : ""}` as Route, {
        scroll: false,
      });
    });
  };

  const toggle = (key: string, value: string) => {
    apply({ [key]: params[key] === value ? undefined : value });
  };

  const activeBand = PRICE_BANDS.find(
    (band) =>
      String(band.min) === params.min_price &&
      String(band.max ?? "") === (params.max_price ?? ""),
  );

  const activeCount = [
    params.q,
    params.category,
    params.min_price,
    params.max_price,
    params.color,
    params.size,
    params.in_stock,
  ].filter(Boolean).length;

  return (
    <div className={cn("space-y-6", pending && "opacity-70 transition-opacity")}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Refine
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              startTransition(() => router.push("/products", { scroll: false }));
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: search.trim() || undefined });
        }}
        className="space-y-2"
      >
        <Label htmlFor="filter-search">Search</Label>
        <div className="flex gap-2">
          <Input
            id="filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. merino"
            className="h-9"
          />
          <Button type="submit" size="sm" variant="outline" className="h-9">
            Go
          </Button>
        </div>
      </form>

      <Separator />

      <fieldset>
        <legend className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Category
        </legend>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => apply({ category: undefined })}
            aria-pressed={!params.category}
            className={cn(
              "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
              !params.category && "bg-accent font-medium",
            )}
          >
            All categories
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => toggle("category", category.slug)}
              aria-pressed={params.category === category.slug}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                params.category === category.slug && "bg-accent font-medium",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Price
        </p>
        <div className="space-y-1">
          {PRICE_BANDS.map((band) => {
            const selected = activeBand === band;
            return (
              <button
                key={band.label}
                type="button"
                onClick={() =>
                  apply({
                    min_price: selected ? undefined : String(band.min),
                    max_price: selected ? undefined : band.max ? String(band.max) : undefined,
                  })
                }
                aria-pressed={selected}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  selected && "bg-accent font-medium",
                )}
              >
                {band.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Colour
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_FACETS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => toggle("color", color.value)}
              aria-pressed={params.color === color.value}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors hover:border-foreground/40",
                params.color === color.value
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {color.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Size
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SIZE_FACETS.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => toggle("size", size.value)}
              aria-pressed={params.size === size.value}
              className={cn(
                "min-w-10 rounded-md border px-3 py-1 text-xs transition-colors hover:border-foreground/40",
                params.size === size.value
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-sm">In stock only</span>
        <Switch
          checked={params.in_stock === "true"}
          onCheckedChange={(checked) => apply({ in_stock: checked ? "true" : undefined })}
          aria-label="Only show in-stock products"
        />
      </label>
    </div>
  );
}

export function FilterSidebar({
  categories,
  params,
}: {
  categories: Category[];
  params: Params;
}) {
  const activeCount = [
    params.q,
    params.category,
    params.min_price,
    params.max_price,
    params.color,
    params.size,
    params.in_stock,
  ].filter(Boolean).length;

  return (
    <>
      <aside className="sticky top-28 hidden w-56 shrink-0 lg:block" aria-label="Filters">
        <FilterContent categories={categories} params={params} />
      </aside>

      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal /> Filters
              {activeCount ? <Badge variant="secondary">{activeCount}</Badge> : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <p className="text-sm font-semibold uppercase tracking-[0.16em]">Filters</p>
            <div className="mt-4 overflow-y-auto pb-10">
              <FilterContent categories={categories} params={params} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
