"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgePercent,
  CalendarClock,
  Loader2,
  Pencil,
  Percent,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { formatNumber, formatPaise, paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { AdminCoupon, CouponUsage, Page } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

type CouponDraft = {
  code: string;
  discount_type: "PERCENT" | "FIXED";
  value: string;
  min_order_value: string;
  max_uses: string;
  per_user_limit: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
};

type CouponPatch = {
  value?: number;
  min_order_value?: number | null;
  max_uses?: number | null;
  per_user_limit?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
};

const emptyDraft: CouponDraft = {
  code: "",
  discount_type: "PERCENT",
  value: "",
  min_order_value: "",
  max_uses: "",
  per_user_limit: "1",
  starts_at: "",
  expires_at: "",
  is_active: true,
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function couponStatus(coupon: AdminCoupon) {
  if (!coupon.is_active) return { label: "Inactive", variant: "secondary" as const };
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now)
    return { label: "Scheduled", variant: "warning" as const };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now)
    return { label: "Expired", variant: "destructive" as const };
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses)
    return { label: "Exhausted", variant: "secondary" as const };
  return { label: "Active", variant: "success" as const };
}

function CouponFields({
  draft,
  onChange,
  isEdit,
}: {
  draft: CouponDraft;
  onChange: (draft: CouponDraft) => void;
  isEdit: boolean;
}) {
  const fixed = draft.discount_type === "FIXED";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="coupon-code">Code</Label>
        <Input
          id="coupon-code"
          value={draft.code}
          onChange={(e) => onChange({ ...draft, code: e.target.value.toUpperCase() })}
          placeholder="WELCOME10"
          maxLength={32}
          disabled={isEdit}
          className="font-mono uppercase"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-type">Type</Label>
        <Select
          id="coupon-type"
          value={draft.discount_type}
          onChange={(e) =>
            onChange({
              ...draft,
              discount_type: e.target.value as "PERCENT" | "FIXED",
            })
          }
          disabled={isEdit}
        >
          <option value="PERCENT">Percentage</option>
          <option value="FIXED">Fixed amount</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-value">{fixed ? "Amount (₹)" : "Percent off"}</Label>
        <Input
          id="coupon-value"
          type="number"
          min="1"
          max={fixed ? undefined : 100}
          step={fixed ? "0.01" : "1"}
          value={draft.value}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
          placeholder={fixed ? "200.00" : "10"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-min">Minimum order (₹)</Label>
        <Input
          id="coupon-min"
          type="number"
          min="0"
          step="0.01"
          value={draft.min_order_value}
          onChange={(e) => onChange({ ...draft, min_order_value: e.target.value })}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-max-uses">Max total uses</Label>
        <Input
          id="coupon-max-uses"
          type="number"
          min="1"
          step="1"
          value={draft.max_uses}
          onChange={(e) => onChange({ ...draft, max_uses: e.target.value })}
          placeholder="Unlimited"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-per-user">Per-customer limit</Label>
        <Input
          id="coupon-per-user"
          type="number"
          min="0"
          step="1"
          value={draft.per_user_limit}
          onChange={(e) => onChange({ ...draft, per_user_limit: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-starts">Starts at</Label>
        <Input
          id="coupon-starts"
          type="datetime-local"
          value={draft.starts_at}
          onChange={(e) => onChange({ ...draft, starts_at: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coupon-expires">Expires at</Label>
        <Input
          id="coupon-expires"
          type="datetime-local"
          value={draft.expires_at}
          onChange={(e) => onChange({ ...draft, expires_at: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Switch
          checked={draft.is_active}
          onCheckedChange={(checked) => onChange({ ...draft, is_active: checked })}
          aria-label="Coupon active"
        />
        Active — customers can apply this code
      </label>
    </div>
  );
}

export function CouponsManager() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = React.useState<AdminCoupon | null>(null);
  const [usagesFor, setUsagesFor] = React.useState<AdminCoupon | null>(null);
  const [usagePage, setUsagePage] = React.useState(1);
  const [draft, setDraft] = React.useState<CouponDraft>(emptyDraft);

  const query = useQuery({
    queryKey: ["admin", "coupons", page],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/coupons", {
          params: { query: { page, page_size: 50 } },
        }),
      ),
  });

  const usages = useQuery({
    queryKey: ["admin", "coupon-usages", usagesFor?.id, usagePage],
    enabled: !!usagesFor,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/coupons/{coupon_id}/usages", {
          params: {
            path: { coupon_id: usagesFor!.id },
            query: { page: usagePage, page_size: 20 },
          },
        }),
      ),
  });

  const create = useMutation({
    mutationFn: async () => {
      const value =
        draft.discount_type === "FIXED"
          ? rupeesToPaise(draft.value)
          : Number.parseInt(draft.value, 10);
      return unwrap(
        await api.POST("/api/admin/coupons", {
          body: {
            code: draft.code.trim().toUpperCase(),
            discount_type: draft.discount_type,
            value,
            min_order_value: draft.min_order_value
              ? rupeesToPaise(draft.min_order_value)
              : undefined,
            max_uses: draft.max_uses ? Number.parseInt(draft.max_uses, 10) : undefined,
            per_user_limit: Number.parseInt(draft.per_user_limit || "1", 10) || 0,
            starts_at: fromLocalInput(draft.starts_at),
            expires_at: fromLocalInput(draft.expires_at),
            is_active: draft.is_active,
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success("Coupon created");
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setCreating(false);
      setDraft(emptyDraft);
    },
    onError: (error) => toastApiError(error),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CouponPatch }) =>
      unwrap(
        await api.PATCH("/api/admin/coupons/{coupon_id}", {
          params: { path: { coupon_id: id } },
          body: patch,
        }),
      ),
    onSuccess: () => {
      toast.success("Coupon updated");
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setEditing(null);
    },
    onError: (error) => toastApiError(error),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/api/admin/coupons/{coupon_id}", {
          params: { path: { coupon_id: id } },
        }),
      ),
    onSuccess: () => {
      toast.success("Coupon deleted");
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      setDeleting(null);
    },
    onError: (error) => toastApiError(error),
  });

  function startEdit(coupon: AdminCoupon) {
    setDraft({
      code: coupon.code,
      discount_type: coupon.discount_type as "PERCENT" | "FIXED",
      value:
        coupon.discount_type === "FIXED"
          ? paiseToRupees(coupon.value)
          : String(coupon.value),
      min_order_value: coupon.min_order_value ? paiseToRupees(coupon.min_order_value) : "",
      max_uses: coupon.max_uses == null ? "" : String(coupon.max_uses),
      per_user_limit: String(coupon.per_user_limit),
      starts_at: toLocalInput(coupon.starts_at),
      expires_at: toLocalInput(coupon.expires_at),
      is_active: coupon.is_active,
    });
    setEditing(coupon);
  }

  const data = query.data as Page<AdminCoupon> | undefined;

  const columns: Column<AdminCoupon>[] = [
    {
      key: "code",
      header: "Code",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-2 py-1 font-mono text-xs font-medium">
            {row.code}
          </span>
          {row.is_active ? null : <Badge variant="secondary">Off</Badge>}
        </div>
      ),
    },
    {
      key: "discount",
      header: "Discount",
      cell: (row) => (
        <span className="text-sm">
          {row.discount_type === "PERCENT" ? `${row.value}%` : formatPaise(row.value)}
        </span>
      ),
    },
    {
      key: "min",
      header: "Min order",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.min_order_value ? formatPaise(row.min_order_value) : "—"}
        </span>
      ),
    },
    {
      key: "usage",
      header: "Used",
      cell: (row) => (
        <span className="text-xs">
          {formatNumber(row.used_count)}
          {row.max_uses ? ` / ${formatNumber(row.max_uses)}` : ""}
        </span>
      ),
    },
    {
      key: "window",
      header: "Window",
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground">
          <p>{row.starts_at ? formatDateTime(row.starts_at) : "Anytime"}</p>
          <p>{row.expires_at ? `→ ${formatDateTime(row.expires_at)}` : "No expiry"}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => {
        const state = couponStatus(row);
        return <Badge variant={state.variant}>{state.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`View usages for ${row.code}`}
            onClick={() => {
              setUsagesFor(row);
              setUsagePage(1);
            }}
          >
            <ReceiptText />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => startEdit(row)}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${row.code}`}
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(row)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  const usageColumns: Column<CouponUsage>[] = [
    {
      key: "order",
      header: "Order",
      cell: (row) => <span className="font-mono text-xs">{row.order_number}</span>,
    },
    {
      key: "email",
      header: "Customer",
      cell: (row) => <span className="text-xs">{row.user_email}</span>,
    },
    {
      key: "discount",
      header: "Discount",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <span className="price-tabular text-xs">{formatPaise(row.discount_amount)}</span>
      ),
    },
    {
      key: "date",
      header: "Used",
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
  ];

  const usageData = usages.data as Page<CouponUsage> | undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Commerce"
        title="Coupons"
        description="Percentage or fixed discounts, usage caps and validity windows. Codes are validated again at checkout."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyDraft);
              setCreating(true);
            }}
          >
            <Plus /> New coupon
          </Button>
        }
      />

      {query.error ? (
        <Alert variant="destructive">
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      {!query.isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="No coupons yet"
          description="Launch a welcome offer or a seasonal promotion. Customers apply the code at checkout."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Create a coupon
            </Button>
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            empty="No coupons."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data ? `${formatNumber(data.total)} coupon${data.total === 1 ? "" : "s"}` : "—"}
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

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) setDraft(emptyDraft);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New coupon</DialogTitle>
            <DialogDescription>
              Fixed amounts are entered in rupees and stored as paise.
            </DialogDescription>
          </DialogHeader>
          <CouponFields draft={draft} onChange={setDraft} isEdit={false} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={
                create.isPending ||
                draft.code.trim().length < 3 ||
                Number(draft.value) <= 0 ||
                (draft.discount_type === "PERCENT" && Number(draft.value) > 100)
              }
            >
              {create.isPending ? <Loader2 className="animate-spin" /> : <Percent />}
              Create coupon
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
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {editing?.code}</DialogTitle>
            <DialogDescription>
              The code and discount type are immutable; create a new coupon to change them.
            </DialogDescription>
          </DialogHeader>
          <CouponFields draft={draft} onChange={setDraft} isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                const value =
                  draft.discount_type === "FIXED"
                    ? rupeesToPaise(draft.value)
                    : Number.parseInt(draft.value, 10);
                update.mutate({
                  id: editing.id,
                  patch: {
                    value,
                    min_order_value: draft.min_order_value
                      ? rupeesToPaise(draft.min_order_value)
                      : null,
                    max_uses: draft.max_uses ? Number.parseInt(draft.max_uses, 10) : null,
                    per_user_limit: Number.parseInt(draft.per_user_limit || "1", 10) || 0,
                    starts_at: fromLocalInput(draft.starts_at) ?? null,
                    expires_at: fromLocalInput(draft.expires_at) ?? null,
                    is_active: draft.is_active,
                  },
                });
              }}
              disabled={update.isPending || Number(draft.value) <= 0}
            >
              {update.isPending ? <Loader2 className="animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!usagesFor}
        onOpenChange={(open) => {
          if (!open) setUsagesFor(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" /> {usagesFor?.code} usage
            </DialogTitle>
            <DialogDescription>
              {usagesFor
                ? `${formatNumber(usagesFor.used_count)} redemption${usagesFor.used_count === 1 ? "" : "s"}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DataTable
            columns={usageColumns}
            rows={usageData?.items ?? []}
            rowKey={(row) => row.order_id}
            loading={usages.isLoading}
            empty="This coupon hasn't been used yet."
          />
          <DialogFooter className="items-center justify-between sm:justify-between">
            <span className="text-xs text-muted-foreground">
              Page {usageData?.page ?? 1} of {usageData?.pages ?? 1}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={usagePage <= 1}
                onClick={() => setUsagePage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!usageData || usagePage >= usageData.pages}
                onClick={() => setUsagePage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete coupon?"
        description={
          deleting
            ? `${deleting.code} will stop working immediately. Past redemptions remain on their orders.`
            : undefined
        }
        confirmLabel="Delete coupon"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}
