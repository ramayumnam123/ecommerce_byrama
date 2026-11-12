"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronRight,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import type { AdminCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { mediaUrl } from "@/lib/utils";

type Draft = {
  name: string;
  parent_id: string;
  image_url: string;
  sort_order: string;
};

type CategoryPatch = {
  name?: string;
  parent_id?: string | null;
  image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

const emptyDraft: Draft = { name: "", parent_id: "", image_url: "", sort_order: "0" };

function flatten(categories: AdminCategory[]) {
  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);
  const rows: { category: AdminCategory; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const nodes = parentId ? childrenOf(parentId) : roots;
    nodes
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .forEach((category) => {
        rows.push({ category, depth });
        walk(category.id, depth + 1);
      });
  };
  walk(null, 0);
  // Defensive: include orphans whose parent is missing from the payload.
  categories
    .filter((c) => c.parent_id && !categories.some((p) => p.id === c.parent_id))
    .forEach((category) => rows.push({ category, depth: 0 }));
  return rows;
}

export function CategoriesManager() {
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminCategory | null>(null);
  const [deleting, setDeleting] = React.useState<AdminCategory | null>(null);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);

  const query = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => unwrap(await api.GET("/api/admin/categories")),
  });

  const categories = (query.data ?? []) as AdminCategory[];
  const rows = flatten(categories);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/admin/categories", {
          body: {
            name: draft.name.trim(),
            parent_id: draft.parent_id || undefined,
            image_url: draft.image_url.trim() || undefined,
            sort_order: Number.parseInt(draft.sort_order || "0", 10) || 0,
          },
        }),
      ),
    onSuccess: () => {
      toast.success("Category created");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      setCreating(false);
      setDraft(emptyDraft);
    },
    onError: (error) => toastApiError(error),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CategoryPatch }) =>
      unwrap(
        await api.PATCH("/api/admin/categories/{category_id}", {
          params: { path: { category_id: id } },
          body: patch,
        }),
      ),
    onSuccess: () => {
      toast.success("Category updated");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      setEditing(null);
    },
    onError: (error) => toastApiError(error),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      unwrap(
        await api.PATCH("/api/admin/categories/{category_id}", {
          params: { path: { category_id: id } },
          body: { is_active },
        }),
      ),
    onSuccess: () => {
      toast.success("Visibility updated");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toastApiError(error),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/api/admin/categories/{category_id}", {
          params: { path: { category_id: id } },
        }),
      ),
    onSuccess: () => {
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      setDeleting(null);
    },
    onError: (error) => toastApiError(error),
  });

  function startEdit(category: AdminCategory) {
    setDraft({
      name: category.name,
      parent_id: category.parent_id ?? "",
      image_url: category.image_url ?? "",
      sort_order: String(category.sort_order),
    });
    setEditing(category);
  }

  const busy = create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Categories"
        description="Order the navigation, nest subcategories and hide collections without deleting history."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyDraft);
              setCreating(true);
            }}
          >
            <Plus /> New category
          </Button>
        }
      />

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : query.error ? (
        <Alert variant="destructive">
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No categories"
          description="Categories power the storefront navigation and product filters."
          action={
            <Button
              onClick={() => {
                setDraft(emptyDraft);
                setCreating(true);
              }}
            >
              <Plus /> Create the first category
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[1fr_120px_120px_160px] gap-3 border-b bg-muted/40 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground max-lg:grid-cols-[1fr_100px_120px]">
            <span>Category</span>
            <span className="text-right">Products</span>
            <span className="text-center">Order</span>
            <span className="text-right">Actions</span>
          </div>
          {rows.map(({ category, depth }) => {
            const image = mediaUrl(category.image_url);
            return (
              <div
                key={category.id}
                className="grid grid-cols-[1fr_120px_120px_160px] items-center gap-3 border-b px-4 py-3 last:border-b-0 max-lg:grid-cols-[1fr_100px_120px] hover:bg-muted/20"
              >
                <div
                  className="flex min-w-0 items-center gap-2"
                  style={{ paddingLeft: depth * 18 }}
                >
                  {depth > 0 ? (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Layers className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt=""
                      className="size-8 shrink-0 rounded object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{category.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {category.slug}
                    </p>
                  </div>
                  {!category.is_active ? (
                    <Badge variant="secondary" className="ml-1">
                      Hidden
                    </Badge>
                  ) : null}
                </div>
                <div className="text-right">
                  <Badge variant="outline">{category.product_count}</Badge>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-muted-foreground">{category.sort_order}</span>
                  <Switch
                    checked={category.is_active}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ id: category.id, is_active: checked })
                    }
                    aria-label={`${category.name} active`}
                  />
                </div>
                <div className="flex justify-end gap-1 max-lg:col-span-3 max-lg:justify-end">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(category)}>
                    <Pencil /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${category.name}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(category)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              The slug is generated from the name. Nest under a parent for sub-navigation.
            </DialogDescription>
          </DialogHeader>
          <CategoryFields draft={draft} onChange={setDraft} categories={categories} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={busy || draft.name.trim().length < 2}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              Create category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>{editing?.slug}</DialogDescription>
          </DialogHeader>
          <CategoryFields
            draft={draft}
            onChange={setDraft}
            categories={categories.filter((c) => c.id !== editing?.id)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                update.mutate({
                  id: editing.id,
                  patch: {
                    name: draft.name.trim(),
                    parent_id: draft.parent_id || null,
                    image_url: draft.image_url.trim() || null,
                    sort_order: Number.parseInt(draft.sort_order || "0", 10) || 0,
                  },
                });
              }}
              disabled={busy || draft.name.trim().length < 2}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete category?"
        description={
          deleting
            ? `${deleting.name} can only be deleted when it has no products or subcategories. Otherwise deactivate it instead.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}

function CategoryFields({
  draft,
  onChange,
  categories,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  categories: AdminCategory[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Home & living"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category-parent">Parent category</Label>
        <Select
          id="category-parent"
          value={draft.parent_id}
          onChange={(e) => onChange({ ...draft, parent_id: e.target.value })}
        >
          <option value="">Top level</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category-image">Image URL</Label>
        <Input
          id="category-image"
          value={draft.image_url}
          onChange={(e) => onChange({ ...draft, image_url: e.target.value })}
          placeholder="https://…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category-order">Sort order</Label>
        <Input
          id="category-order"
          type="number"
          value={draft.sort_order}
          onChange={(e) => onChange({ ...draft, sort_order: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Lower numbers appear first in navigation.
        </p>
      </div>
    </div>
  );
}
