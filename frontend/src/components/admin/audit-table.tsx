"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Copy, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { formatNumber } from "@/lib/money";
import type { AdminAudit, Page } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

const ENTITY_TYPES = [
  "product",
  "variant",
  "category",
  "coupon",
  "order",
  "user",
  "media",
  "auth",
];

export function AuditTable() {
  const [page, setPage] = React.useState(1);
  const [entityType, setEntityType] = React.useState("");
  const [action, setAction] = React.useState("");
  const [actionQuery, setActionQuery] = React.useState("");
  const [selected, setSelected] = React.useState<AdminAudit | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setAction(actionQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [actionQuery]);

  const query = useQuery({
    queryKey: ["admin", "audit", { page, entityType, action }],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/audit", {
          params: {
            query: {
              page,
              page_size: 30,
              entity_type: entityType || undefined,
              action: action || undefined,
            },
          },
        }),
      ),
  });

  const data = query.data as Page<AdminAudit> | undefined;
  const hasFilters = !!(entityType || action);

  async function copyRequestId(requestId: string | null) {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      toast.success("Request ID copied");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }

  const columns: Column<AdminAudit>[] = [
    {
      key: "time",
      header: "When",
      cell: (row) => (
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      cell: (row) => (
        <span className="text-xs">{row.actor_email ?? "system"}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (row) => <Badge variant="outline">{row.action}</Badge>,
    },
    {
      key: "entity",
      header: "Entity",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-xs">{row.entity_type}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {row.entity_id ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "request",
      header: "Request",
      cell: (row) =>
        row.request_id ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void copyRequestId(row.request_id);
            }}
            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            title="Copy request ID"
          >
            {row.request_id.slice(0, 8)} <Copy className="size-2.5" />
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        ),
    },
    {
      key: "diff",
      header: "",
      className: "text-right",
      headClassName: "text-right",
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row);
          }}
        >
          Diff
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="Every admin mutation is recorded with actor, entity, diff and request ID. Immutable by design."
      />

      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[180px_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="audit-entity">Entity type</Label>
          <Select
            id="audit-entity"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All entities</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type} className="capitalize">
                {type}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Action contains</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="audit-action"
              value={actionQuery}
              onChange={(e) => setActionQuery(e.target.value)}
              placeholder="order.shipped, product.create…"
              className="pl-9 font-mono"
            />
          </div>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            disabled={!hasFilters}
            onClick={() => {
              setEntityType("");
              setActionQuery("");
              setAction("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {query.error ? (
        <Alert variant="destructive">
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      {!query.isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit entries match"
          description="Admin actions will appear here as soon as they happen."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            empty="No audit entries."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data
                ? `${formatNumber(data.total)} entr${data.total === 1 ? "y" : "ies"}`
                : "—"}
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

      <p className="text-xs text-muted-foreground">
        Note: the API filters by entity type and exact action. Use the search box for a
        prefix or full action name; request IDs are clipboard-ready for Sentry lookups.
      </p>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> {selected?.action}
            </DialogTitle>
            <DialogDescription>
              {selected?.entity_type}
              {selected?.entity_id ? ` · ${selected.entity_id}` : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50dvh] overflow-auto rounded-lg bg-muted/60 p-4 text-[11px] leading-relaxed">
            {selected ? JSON.stringify(selected.diff, null, 2) : ""}
          </pre>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Actor: <span className="text-foreground">{selected?.actor_email ?? "system"}</span>
            </p>
            <p>
              At: <span className="text-foreground">{formatDateTime(selected?.created_at)}</span>
            </p>
            <p>
              IP: <span className="text-foreground">{selected?.ip ?? "—"}</span>
            </p>
            <p>
              Request:{" "}
              <span className="font-mono text-foreground">{selected?.request_id ?? "—"}</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
