"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import type {
  AdminCategory,
  AdminVariant,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ImageUploader, type EditableImage } from "./image-uploader";

type DraftVariant = {
  key: string;
  name: string;
  sku: string;
  price: string;
  compare_at_price: string;
  stock: string;
  weight_grams: string;
  attributes: string;
};

type VariantPatch = {
  name?: string;
  sku?: string | null;
  price?: number;
  compare_at_price?: number | null;
  stock?: number;
  weight_grams?: number | null;
  is_active?: boolean;
};

function blankVariant(): DraftVariant {
  return {
    key: crypto.randomUUID(),
    name: "",
    sku: "",
    price: "",
    compare_at_price: "",
    stock: "0",
    weight_grams: "",
    attributes: "",
  };
}

function parseAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const [key, ...rest] = chunk.split("=");
      if (!key?.trim()) return;
      out[key.trim().toLowerCase()] = rest.join("=").trim();
    });
  return out;
}

function variantBody(draft: DraftVariant) {
  const price = rupeesToPaise(draft.price);
  const compare = draft.compare_at_price.trim()
    ? rupeesToPaise(draft.compare_at_price)
    : undefined;
  return {
    name: draft.name.trim(),
    sku: draft.sku.trim() || undefined,
    price,
    compare_at_price: compare && compare >= price ? compare : undefined,
    stock: Math.max(0, Number.parseInt(draft.stock || "0", 10) || 0),
    weight_grams: draft.weight_grams.trim()
      ? Math.max(0, Number.parseInt(draft.weight_grams, 10) || 0)
      : undefined,
    attributes: parseAttributes(draft.attributes),
  };
}

function DraftFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: DraftVariant;
  onChange: (draft: DraftVariant) => void;
  idPrefix: string;
}) {
  const set = (key: keyof DraftVariant, value: string) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`}>Variant name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Black / Medium"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-sku`}>SKU (auto if blank)</Label>
        <Input
          id={`${idPrefix}-sku`}
          value={draft.sku}
          onChange={(e) => set("sku", e.target.value.toUpperCase())}
          placeholder="TEE-BLK-M"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-price`}>Price (₹)</Label>
        <Input
          id={`${idPrefix}-price`}
          type="number"
          min="1"
          step="0.01"
          value={draft.price}
          onChange={(e) => set("price", e.target.value)}
          placeholder="1499.00"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-compare`}>Compare at (₹)</Label>
        <Input
          id={`${idPrefix}-compare`}
          type="number"
          min="0"
          step="0.01"
          value={draft.compare_at_price}
          onChange={(e) => set("compare_at_price", e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-stock`}>Stock</Label>
        <Input
          id={`${idPrefix}-stock`}
          type="number"
          min="0"
          step="1"
          value={draft.stock}
          onChange={(e) => set("stock", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-weight`}>Weight (g)</Label>
        <Input
          id={`${idPrefix}-weight`}
          type="number"
          min="0"
          step="1"
          value={draft.weight_grams}
          onChange={(e) => set("weight_grams", e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-1 sm:col-span-2 lg:col-span-2">
        <Label htmlFor={`${idPrefix}-attributes`}>Attributes</Label>
        <Input
          id={`${idPrefix}-attributes`}
          value={draft.attributes}
          onChange={(e) => set("attributes", e.target.value)}
          placeholder="color=black, size=medium"
        />
      </div>
    </div>
  );
}

function ExistingVariantRow({
  variant,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  variant: AdminVariant;
  onSave: (patch: VariantPatch) => Promise<void>;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [name, setName] = React.useState(variant.name);
  const [sku, setSku] = React.useState(variant.sku);
  const [price, setPrice] = React.useState(paiseToRupees(variant.price));
  const [compare, setCompare] = React.useState(paiseToRupees(variant.compare_at_price));
  const [stock, setStock] = React.useState(String(variant.stock));
  const [weight, setWeight] = React.useState(
    variant.weight_grams == null ? "" : String(variant.weight_grams),
  );
  const [active, setActive] = React.useState(variant.is_active);

  const dirty =
    name !== variant.name ||
    sku !== variant.sku ||
    price !== paiseToRupees(variant.price) ||
    compare !== paiseToRupees(variant.compare_at_price) ||
    stock !== String(variant.stock) ||
    weight !== (variant.weight_grams == null ? "" : String(variant.weight_grams)) ||
    active !== variant.is_active;

  async function save() {
    const nextPrice = rupeesToPaise(price);
    if (!name.trim()) {
      toast.error("Variant name is required");
      return;
    }
    if (nextPrice <= 0) {
      toast.error("Price must be greater than zero");
      return;
    }
    const nextCompare = compare.trim() ? rupeesToPaise(compare) : null;
    await onSave({
      name: name.trim(),
      sku: sku.trim() || null,
      price: nextPrice,
      compare_at_price: nextCompare,
      stock: Math.max(0, Number.parseInt(stock || "0", 10) || 0),
      weight_grams: weight.trim() ? Number.parseInt(weight, 10) : null,
      is_active: active,
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{variant.sku}</span>
          <Badge variant={variant.is_active ? "success" : "secondary"}>
            {variant.is_active ? "Active" : "Inactive"}
          </Badge>
          <Badge variant="outline">{variant.sold_units} sold</Badge>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Active
            <Switch checked={active} onCheckedChange={setActive} aria-label="Variant active" />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Delete variant"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={deleting}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>SKU</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label>Price (₹)</Label>
          <Input type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Compare at (₹)</Label>
          <Input type="number" min="0" step="0.01" value={compare} onChange={(e) => setCompare(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Stock</Label>
          <Input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Weight (g)</Label>
          <Input type="number" min="0" step="1" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>
      {Object.keys(variant.attributes).length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(variant.attributes).map(([key, value]) => (
            <Badge key={key} variant="secondary">
              {key}: {String(value)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProductEditor({ productId }: { productId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = !!productId;
  const [tab, setTab] = React.useState("basics");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => unwrap(await api.GET("/api/admin/categories")),
  });

  const productQuery = useQuery({
    queryKey: ["admin", "product", productId],
    enabled: isEdit,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/products/{product_id}", {
          params: { path: { product_id: productId! } },
        }),
      ),
  });

  const product = productQuery.data;

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [images, setImages] = React.useState<EditableImage[]>([]);
  const [drafts, setDrafts] = React.useState<DraftVariant[]>([blankVariant()]);
  const [newVariant, setNewVariant] = React.useState<DraftVariant>(blankVariant());
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description);
    setCategoryId(product.category_id);
    setActive(product.is_active);
    setImages(product.images.map((image) => ({ ...image })));
    setDirty(false);
  }, [product]);

  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "product", productId] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2) throw new Error("Product name needs at least 2 characters");
      if (!categoryId) throw new Error("Choose a category");
      if (!drafts.length) throw new Error("Add at least one variant");
      const variants = drafts.map(variantBody);
      if (variants.some((v) => !v.name)) throw new Error("Every variant needs a name");
      if (variants.some((v) => v.price <= 0)) throw new Error("Every variant needs a price");
      if (!images.length) throw new Error("Add at least one image");

      return unwrap(
        await api.POST("/api/admin/products", {
          body: {
            name: name.trim(),
            description,
            category_id: categoryId,
            is_active: active,
            images: images.map((image) => ({
              url: image.url,
              alt_text: image.alt_text || undefined,
            })),
            variants,
          },
        }),
      );
    },
    onSuccess: (created) => {
      toast.success("Product created", { description: created.name });
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      router.push(`/admin/products/${created.id}/edit` as Route);
    },
    onError: (error) => toastApiError(error),
  });

  const updateBasics = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH("/api/admin/products/{product_id}", {
          params: { path: { product_id: productId! } },
          body: {
            name: name.trim(),
            description,
            category_id: categoryId,
            is_active: active,
          },
        }),
      ),
    onSuccess: () => {
      toast.success("Product updated");
      setDirty(false);
      invalidate();
    },
    onError: (error) => toastApiError(error),
  });

  const replaceImages = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/admin/products/{product_id}/images", {
          params: { path: { product_id: productId! } },
          body: {
            images: images.map((image) => ({
              url: image.url,
              alt_text: image.alt_text || undefined,
            })),
          },
        }),
      ),
    onSuccess: (updated) => {
      toast.success("Images saved");
      if (updated) setImages(updated.images.map((image) => ({ ...image })));
      invalidate();
    },
    onError: (error) => toastApiError(error),
  });

  const addVariant = useMutation({
    mutationFn: async () => {
      const body = variantBody(newVariant);
      if (!body.name) throw new Error("Variant name is required");
      if (body.price <= 0) throw new Error("Price must be greater than zero");
      return unwrap(
        await api.POST("/api/admin/products/{product_id}/variants", {
          params: { path: { product_id: productId! } },
          body,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Variant added");
      setNewVariant(blankVariant());
      invalidate();
    },
    onError: (error) => toastApiError(error),
  });

  const updateVariant = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: VariantPatch }) =>
      unwrap(
        await api.PATCH("/api/admin/products/variants/{variant_id}", {
          params: { path: { variant_id: id } },
          body: patch,
        }),
      ),
    onSuccess: () => {
      toast.success("Variant updated");
      invalidate();
    },
    onError: (error) => toastApiError(error),
  });

  const deleteVariant = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/api/admin/products/variants/{variant_id}", {
          params: { path: { variant_id: id } },
        }),
      ),
    onSuccess: () => {
      toast.success("Variant removed");
      invalidate();
    },
    onError: (error) => toastApiError(error),
  });

  const softDelete = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE("/api/admin/products/{product_id}", {
          params: { path: { product_id: productId! } },
        }),
      ),
    onSuccess: () => {
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      router.push("/admin/products" as Route);
    },
    onError: (error) => toastApiError(error),
  });

  if (isEdit && productQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (isEdit && productQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{messageForError(productQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  if (isEdit && !product) return null;

  const categories = (categoriesQuery.data ?? []) as AdminCategory[];

  function onSave() {
    if (isEdit) {
      setDirty(false);
      updateBasics.mutate(undefined, {
        onSuccess: () => {
          if (imagesDirty) replaceImages.mutate();
        },
      });
    } else {
      create.mutate();
    }
  }

  const imagesDirty =
    isEdit &&
    product != null &&
    JSON.stringify(images.map((i) => [i.url, i.alt_text])) !==
      JSON.stringify(product.images.map((i) => [i.url, i.alt_text]));

  const busy = create.isPending || updateBasics.isPending || replaceImages.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={isEdit ? "Catalogue" : "New product"}
        title={isEdit ? product!.name : "Add a product"}
        description={
          isEdit
            ? `Manage basics, media and ${product!.variants.length} variant${product!.variants.length === 1 ? "" : "s"}. Changes are audited.`
            : "Create the product with at least one variant and one image. You can fine-tune inventory afterwards."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/products">Back to products</Link>
            </Button>
            {isEdit ? (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 /> Archive
              </Button>
            ) : null}
            <Button onClick={onSave} disabled={busy || (isEdit && !dirty && !imagesDirty)}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />}
              {isEdit ? "Save changes" : "Create product"}
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
          <TabsTrigger value="variants">
            Variants ({isEdit ? product!.variants.length : drafts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basics">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle>Product details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="product-name">Name</Label>
                  <Input
                    id="product-name"
                    value={name}
                    maxLength={180}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Hand-thrown stoneware mug"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-description">Description</Label>
                  <Textarea
                    id="product-description"
                    value={description}
                    rows={6}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Materials, dimensions, care instructions…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-category">Category</Label>
                  <Select
                    id="product-category"
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="">Choose a category…</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                  {categories.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No categories yet —{" "}
                      <Link href="/admin/categories" className="underline underline-offset-2">
                        create one first
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Publishing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      Active
                      <span className="block text-xs text-muted-foreground">
                        Visible in the storefront
                      </span>
                    </span>
                    <Switch
                      checked={active}
                      onCheckedChange={(checked) => {
                        setActive(checked);
                        setDirty(true);
                      }}
                      aria-label="Product active"
                    />
                  </label>
                  {isEdit ? (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        Slug: <span className="font-mono">{product!.slug}</span>
                      </p>
                      <p>
                        Created: {new Date(product!.created_at).toLocaleDateString("en-IN")}
                      </p>
                      <Link
                        href={`/products/${product!.slug}`}
                        target="_blank"
                        className="inline-block underline underline-offset-2"
                      >
                        View on storefront ↗
                      </Link>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      The slug is generated from the name on save.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SEO preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    maison.local › products › {product?.slug ?? "your-product"}
                  </p>
                  <p className="line-clamp-2 text-sm text-[#1a0dab] dark:text-[#8ab4f8]">
                    {name || "Product name"} · Maison
                  </p>
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {description || "Add a description so search results read naturally."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="images">
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUploader
                images={images}
                onChange={(next) => {
                  setImages(next);
                  setDirty(true);
                }}
              />
              {isEdit ? (
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => replaceImages.mutate()}
                    disabled={!imagesDirty || replaceImages.isPending}
                  >
                    {replaceImages.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    Save image order
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variants">
          <div className="space-y-4">
            {isEdit ? (
              <>
                {product!.variants.map((variant) => (
                  <ExistingVariantRow
                    key={variant.id}
                    variant={variant}
                    saving={
                      updateVariant.isPending &&
                      updateVariant.variables?.id === variant.id
                    }
                    deleting={
                      deleteVariant.isPending && deleteVariant.variables === variant.id
                    }
                    onSave={(patch) =>
                      updateVariant.mutateAsync({ id: variant.id, patch }).then(() => undefined)
                    }
                    onDelete={() => {
                      if (confirm(`Remove variant ${variant.name}?`)) {
                        deleteVariant.mutate(variant.id);
                      }
                    }}
                  />
                ))}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Plus className="size-4" /> Add variant
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DraftFields
                      idPrefix="new-variant"
                      draft={newVariant}
                      onChange={setNewVariant}
                    />
                    <Button
                      onClick={() => addVariant.mutate()}
                      disabled={addVariant.isPending}
                    >
                      {addVariant.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                      Add variant
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                {drafts.map((draft, index) => (
                  <div key={draft.key} className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Variant {index + 1}
                      </p>
                      {drafts.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove variant"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setDrafts((rows) => rows.filter((_, i) => i !== index))
                          }
                        >
                          <X />
                        </Button>
                      ) : null}
                    </div>
                    <DraftFields
                      idPrefix={`draft-${index}`}
                      draft={draft}
                      onChange={(next) =>
                        setDrafts((rows) => rows.map((row, i) => (i === index ? next : row)))
                      }
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() => setDrafts((rows) => [...rows, blankVariant()])}
                >
                  <Plus /> Add another variant
                </Button>
              </>
            )}

            <Alert>
              <Search />
              <AlertDescription>
                Prices are entered in rupees and stored as integer paise. Compare-at must be
                at or above the selling price; leave it blank for no strike-through.
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
      </Tabs>

      {isEdit ? (
        <p className="text-xs text-muted-foreground">
          Variants and images save independently. Use the variant row&apos;s Save button for
          stock and price edits.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Archive this product?"
        description="Soft delete hides it from the storefront while preserving order history. You can show archived products with the filter on the products list."
        confirmLabel="Archive product"
        destructive
        onConfirm={async () => {
          await softDelete.mutateAsync();
        }}
      />
    </div>
  );
}
