"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  ImageOff,
  Loader2,
  Package,
  PackageSearch,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { formatNumber, formatPaise } from "@/lib/money";
import type { AdminCategory, AdminProductListItem, Page } from "@/lib/types";
import { mediaUrl } from "@/lib/utils";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

function StockDialog({
  product,
  onClose,
}: {
  product: AdminProductListItem | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["admin", "product", product?.id],
    enabled: !!product,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/products/{product_id}", {
          params: { path: { product_id: product!.id } },
        }),
      ),
  });

  const [stocks, setStocks] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!detail.data) return;
    setStocks(
      Object.fromEntries(detail.data.variants.map((v) => [v.id, String(v.stock)])),
    );
  }, [detail.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!detail.data) return;
      const changed = detail.data.variants.filter(
        (variant) => String(variant.stock) !== stocks[variant.id],
      );
      for (const variant of changed) {
        await unwrap(
          await api.PATCH("/api/admin/products/variants/{variant_id}", {
            params: { path: { variant_id: variant.id } },
            body: { stock: Math.max(0, Number.parseInt(stocks[variant.id] || "0", 10) || 0) },
          }),
        );
      }
      return changed.length;
    },
    onSuccess: (count) => {
      toast.success(count ? `${count} variant${count === 1 ? "" : "s"} updated` : "No changes");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "product", product?.id] });
      onClose();
    },
    onError: (error) => toastApiError(error),
  });

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick stock edit</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : detail.error ? (
          <Alert variant="destructive">
            <AlertDescription>{messageForError(detail.error)}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            {detail.data?.variants.map((variant) => (
              <div key={variant.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{variant.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{variant.sku}</p>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 w-24"
                  aria-label={`Stock for ${variant.name}`}
                  value={stocks[variant.id] ?? ""}
                  onChange={(e) =>
                    setStocks((prev) => ({ ...prev, [variant.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || detail.isLoading}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsTable() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [includeDeleted, setIncludeDeleted] = React.useState(false);
  const [stockProduct, setStockProduct] = React.useState<AdminProductListItem | null>(null);
  const [archiving, setArchiving] = React.useState<AdminProductListItem | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => unwrap(await api.GET("/api/admin/categories")),
  });

  const products = useQuery({
    queryKey: ["admin", "products", { page, query, categoryId, includeDeleted }],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/products", {
          params: {
            query: {
              page,
              page_size: ADMIN_PAGE_SIZE,
              q: query || undefined,
              category_id: categoryId || undefined,
              include_deleted: includeDeleted,
            },
          },
        }),
      ),
  });

  const archive = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/api/admin/products/{product_id}", {
          params: { path: { product_id: id } },
        }),
      ),
    onSuccess: () => {
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      setArchiving(null);
    },
    onError: (error) => toastApiError(error),
  });

  const categoryMap = new Map(
    ((categories.data ?? []) as AdminCategory[]).map((c) => [c.id, c.name]),
  );

  const data = products.data as Page<AdminProductListItem> | undefined;

  const columns: Column<AdminProductListItem>[] = [
    {
      key: "product",
      header: "Product",
      cell: (row) => {
        const src = mediaUrl(row.image_url);
        return (
          <div className="flex items-center gap-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
              {src ? (
                <Image src={src} alt="" fill sizes="40px" className="object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-4" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {row.slug}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => (
        <span className="text-xs">{categoryMap.get(row.category_id) ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.deleted_at ? (
          <Badge variant="secondary">
            <Archive /> Archived
          </Badge>
        ) : row.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="warning">Draft</Badge>
        ),
    },
    {
      key: "variants",
      header: "Variants",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => <span className="text-xs">{row.variant_count}</span>,
    },
    {
      key: "stock",
      header: "Stock",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setStockProduct(row);
          }}
          className="rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent"
          title="Quick stock edit"
        >
          <Badge variant={row.total_stock === 0 ? "destructive" : row.total_stock <= 5 ? "warning" : "outline"}>
            {formatNumber(row.total_stock)}
          </Badge>
        </button>
      ),
    },
    {
      key: "price",
      header: "From",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <span className="price-tabular text-sm">{formatPaise(row.min_price)}</span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/products/${row.id}/edit`}>Edit</Link>
          </Button>
          {!row.deleted_at ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Archive ${row.name}`}
              className="text-destructive hover:text-destructive"
              onClick={() => setArchiving(row)}
            >
              <Archive />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Search, price and inventory. Click a row to edit; click stock for an inline inventory update."
        actions={
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus /> New product
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="product-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="product-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or SKU…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:w-52">
          <Label htmlFor="product-category-filter">Category</Label>
          <Select
            id="product-category-filter"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {((categories.data ?? []) as AdminCategory[]).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 pb-0.5 text-xs text-muted-foreground">
          <Checkbox
            checked={includeDeleted}
            onCheckedChange={(checked) => {
              setIncludeDeleted(checked === true);
              setPage(1);
            }}
          />
          Include archived
        </label>
      </div>

      {products.error ? (
        <Alert variant="destructive">
          <AlertDescription>{messageForError(products.error)}</AlertDescription>
        </Alert>
      ) : null}

      {!products.isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No products found"
          description={
            query || categoryId
              ? "Try a broader search or clear the category filter."
              : "Create your first product to start selling."
          }
          action={
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus /> New product
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(row) => row.id}
            loading={products.isLoading}
            onRowClick={(row) => router.push(`/admin/products/${row.id}/edit`)}
            empty="No products."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data ? `${formatNumber(data.total)} product${data.total === 1 ? "" : "s"}` : "—"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {data?.page ?? 1} of {data?.pages ?? 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <StockDialog product={stockProduct} onClose={() => setStockProduct(null)} />

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive product?"
        description={
          archiving
            ? `${archiving.name} will disappear from the storefront. Order history is preserved.`
            : undefined
        }
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          if (archiving) await archive.mutateAsync(archiving.id);
        }}
      />

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Package className="size-3.5" /> Archiving is a soft delete; stock and prices stay
        editable.
        <ArrowRight className="size-3" /> Use “Include archived” to find them again.
      </p>
    </div>
  );
}
