"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError, toastApiError } from "@/lib/errors";
import type { Address } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddressForm, type AddressValues } from "@/components/checkout/address-form";

const MAX_ADDRESSES = 10;

function toBody(values: AddressValues) {
  return {
    line1: values.line1,
    line2: values.line2 || undefined,
    city: values.city,
    state: values.state,
    postal_code: values.postal_code,
    country: values.country.toUpperCase(),
    phone: values.phone,
    is_default: values.is_default,
  };
}

export function AddressesView() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<Address | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Address | null>(null);

  const query = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => unwrap(await api.GET("/api/users/addresses")),
  });

  const addresses = query.data ?? [];

  const create = useMutation({
    mutationFn: async (values: AddressValues) =>
      unwrap(await api.POST("/api/users/addresses", { body: toBody(values) })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setAdding(false);
      toast.success("Address saved");
    },
    onError: (error) => toastApiError(error),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: AddressValues }) =>
      unwrap(
        await api.PATCH("/api/users/addresses/{address_id}", {
          params: { path: { address_id: id } },
          body: toBody(values),
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setEditing(null);
      toast.success("Address updated");
    },
    onError: (error) => toastApiError(error),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/api/users/addresses/{address_id}", {
          params: { path: { address_id: id } },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      setDeleting(null);
      toast.success("Address removed");
    },
    onError: (error) => toastApiError(error),
  });

  const makeDefault = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.PATCH("/api/users/addresses/{address_id}", {
          params: { path: { address_id: id } },
          body: { is_default: true },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      toast.success("Default address updated");
    },
    onError: (error) => toastApiError(error),
  });

  const atLimit = addresses.length >= MAX_ADDRESSES;

  return (
    <div className="container-page max-w-4xl py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Account
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Addresses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivery details for a faster checkout. Up to {MAX_ADDRESSES} saved addresses.
          </p>
        </div>
        <Button
          onClick={() => setAdding(true)}
          disabled={atLimit || query.isLoading}
          title={atLimit ? "Remove an address to add another" : undefined}
        >
          <Plus /> Add address
        </Button>
      </div>

      {atLimit ? (
        <Alert className="mt-6">
          <MapPin />
          <AlertDescription>
            You&apos;ve reached the {MAX_ADDRESSES}-address limit. Delete one to add a new
            address.
          </AlertDescription>
        </Alert>
      ) : null}

      {query.isLoading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : query.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{messageForError(query.error)}</AlertDescription>
        </Alert>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Add a delivery address now, or save one during checkout."
          className="mt-8"
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add your first address
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <div
              key={address.id}
              className="flex flex-col rounded-xl border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{address.line1}</p>
                    {address.is_default ? (
                      <Badge variant="success">
                        <Star /> Default
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[address.line2, address.city, address.state, address.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{address.country}</p>
                </div>
              </div>
              <p className="mt-3 text-sm">{address.phone}</p>

              <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
                {!address.is_default ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => makeDefault.mutate(address.id)}
                    disabled={makeDefault.isPending}
                  >
                    {makeDefault.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Star />
                    )}
                    Make default
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(address)}
                  className="ml-auto"
                >
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(address)}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) create.reset();
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add address</DialogTitle>
            <DialogDescription>
              We only use this to deliver your orders.
            </DialogDescription>
          </DialogHeader>
          <AddressForm
            onSubmit={async (values) => {
              await create.mutateAsync(values);
            }}
            submitting={create.isPending}
            submitLabel="Save address"
          />
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
            <DialogTitle>Edit address</DialogTitle>
            <DialogDescription>
              Changes apply to future orders only. Past orders keep their snapshot.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <AddressForm
              key={editing.id}
              defaultValues={editing}
              onSubmit={async (values) => {
                await update.mutateAsync({ id: editing.id, values });
              }}
              submitting={update.isPending}
              submitLabel="Save changes"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this address?"
        description={
          deleting
            ? `${deleting.line1}, ${deleting.city} will be removed. Orders already placed are unaffected.`
            : undefined
        }
        confirmLabel="Delete address"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}
