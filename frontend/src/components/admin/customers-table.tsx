"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Download,
  Loader2,
  Search,
  Settings2,
  ShieldCheck,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import { downloadCsv } from "@/lib/format";
import { formatDate } from "@/lib/format";
import { formatNumber } from "@/lib/money";
import type { AdminUser, Page } from "@/lib/types";
import { useAuthStore } from "@/lib/auth";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
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

function ManageCustomer({
  customer,
  onClose,
}: {
  customer: AdminUser | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [role, setRole] = React.useState<"CUSTOMER" | "ADMIN">("CUSTOMER");
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (!customer) return;
    setRole(customer.role as "CUSTOMER" | "ADMIN");
    setActive(customer.is_active);
  }, [customer]);

  const save = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      return unwrap(
        await api.PATCH("/api/admin/users/{user_id}", {
          params: { path: { user_id: customer.id } },
          body: { role, is_active: active },
        }),
      );
    },
    onSuccess: () => {
      toast.success("Customer updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (error) => toastApiError(error),
  });

  const isSelf = me?.id === customer?.id;

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage customer</DialogTitle>
          <DialogDescription>
            {customer?.full_name} · {customer?.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Orders</p>
              <p className="mt-1 text-sm font-medium">{customer?.orders_count ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Joined</p>
              <p className="mt-1 text-sm font-medium">{formatDate(customer?.created_at)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-role">Role</Label>
            <Select
              id="customer-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "CUSTOMER" | "ADMIN")}
              disabled={isSelf}
            >
              <option value="CUSTOMER">Customer</option>
              <option value="ADMIN">Admin</option>
            </Select>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">
                You can&apos;t change your own role or deactivate yourself.
              </p>
            ) : null}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              Account active
              <span className="block text-xs text-muted-foreground">
                Deactivated customers can&apos;t sign in or check out.
              </span>
            </span>
            <Switch
              checked={active}
              onCheckedChange={setActive}
              disabled={isSelf}
              aria-label="Account active"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isSelf}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomersTable() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState("");
  const [managing, setManaging] = React.useState<AdminUser | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const users = useQuery({
    queryKey: ["admin", "users", { page, query, role, activeFilter }],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/users", {
          params: {
            query: {
              page,
              page_size: ADMIN_PAGE_SIZE,
              q: query || undefined,
              role: (role || undefined) as "CUSTOMER" | "ADMIN" | undefined,
              is_active:
                activeFilter === "" ? undefined : activeFilter === "active",
            },
          },
        }),
      ),
  });

  const quickToggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      unwrap(
        await api.PATCH("/api/admin/users/{user_id}", {
          params: { path: { user_id: id } },
          body: { is_active },
        }),
      ),
    onSuccess: () => {
      toast.success("Account status updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => toastApiError(error),
  });

  const data = users.data as Page<AdminUser> | undefined;
  const me = useAuthStore((s) => s.user);

  const columns: Column<AdminUser>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{row.full_name}</p>
            {row.role === "ADMIN" ? (
              <Badge variant="copper">
                <ShieldCheck /> Admin
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: "verified",
      header: "Email",
      cell: (row) =>
        row.email_verified ? (
          <Badge variant="success">
            <BadgeCheck /> Verified
          </Badge>
        ) : (
          <Badge variant="warning">Unverified</Badge>
        ),
    },
    {
      key: "orders",
      header: "Orders",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <Link
          href={`/admin/orders?q=${encodeURIComponent(row.email)}` as Route}
          className="text-xs underline-offset-4 hover:underline"
        >
          {formatNumber(row.orders_count)}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.is_active ? (
          <Badge variant="outline">Active</Badge>
        ) : (
          <Badge variant="destructive">
            <UserX /> Deactivated
          </Badge>
        ),
    },
    {
      key: "joined",
      header: "Joined",
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
        <div className="flex items-center justify-end gap-2">
          <Switch
            checked={row.is_active}
            disabled={row.id === me?.id || quickToggle.isPending}
            onCheckedChange={(checked) =>
              quickToggle.mutate({ id: row.id, is_active: checked })
            }
            aria-label={`Toggle ${row.email} active`}
          />
          <Button variant="ghost" size="sm" onClick={() => setManaging(row)}>
            <Settings2 /> Manage
          </Button>
        </div>
      ),
    },
  ];

  function exportCsv() {
    const rows = (data?.items ?? []).map((user) => ({
      name: user.full_name,
      email: user.email,
      role: user.role,
      active: user.is_active,
      email_verified: user.email_verified,
      orders_count: user.orders_count,
      joined: user.created_at,
    }));
    if (!rows.length) {
      toast.message("Nothing to export");
      return;
    }
    downloadCsv(`customers-page-${page}.csv`, rows);
    toast.success("Customers exported");
  }

  const hasFilters = !!(query || role || activeFilter);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Commerce"
        title="Customers"
        description="Accounts, roles and access. Deactivate rather than delete to preserve order history."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!data?.items.length}>
            <Download /> Export page CSV
          </Button>
        }
      />

      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_170px_170px_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="customer-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="customer-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-role-filter">Role</Label>
          <Select
            id="customer-role-filter"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="CUSTOMER">Customers</option>
            <option value="ADMIN">Admins</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-active-filter">Status</Label>
          <Select
            id="customer-active-filter"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            disabled={!hasFilters}
            onClick={() => {
              setSearch("");
              setRole("");
              setActiveFilter("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {users.error ? (
        <Alert variant="destructive">
          <AlertDescription>{messageForError(users.error)}</AlertDescription>
        </Alert>
      ) : null}

      {!users.isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers match"
          description={hasFilters ? "Try a different search or filter." : "No accounts yet."}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(row) => row.id}
            loading={users.isLoading}
            empty="No customers."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data ? `${formatNumber(data.total)} account${data.total === 1 ? "" : "s"}` : "—"}
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

      <ManageCustomer customer={managing} onClose={() => setManaging(null)} />
    </div>
  );
}
