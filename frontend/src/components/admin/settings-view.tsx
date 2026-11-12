"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BadgeIndianRupee,
  Banknote,
  ClipboardCheck,
  CreditCard,
  Loader2,
  Mail,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import {
  FLAT_SHIPPING_FEE,
  FREE_SHIPPING_THRESHOLD,
  STORE_NAME,
  SUPPORT_EMAIL,
} from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function SettingsView() {
  const sweep = useMutation({
    mutationFn: async () =>
      (await unwrap(
        await api.POST("/api/admin/maintenance/reservations/sweep"),
      )) as unknown as { swept: number },
    onSuccess: (result) => {
      toast.success("Reservation sweep complete", {
        description:
          result.swept === 0
            ? "No expired reservations found."
            : `${result.swept} expired reservation${result.swept === 1 ? "" : "s"} released.`,
      });
    },
    onError: (error) => toastApiError(error),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Store configuration is environment-backed in this build. The write API for these values is not exposed by the backend yet, so this screen is read-only apart from maintenance actions."
      />

      <Alert>
        <Settings2 />
        <AlertTitle>Read-only configuration</AlertTitle>
        <AlertDescription>
          Update values through the backend environment (SHIPPING_FEE, FREE_SHIPPING_THRESHOLD,
          TAX_RATE, SUPPORT_EMAIL) and restart the API. A future <code>/admin/settings</code>{" "}
          endpoint will make these editable here.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="store">
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="shipping">Shipping &amp; tax</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="runbooks">Runbooks</TabsTrigger>
        </TabsList>

        <TabsContent value="store">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Store profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Row label="Store name" value={STORE_NAME} />
                <Row label="Support email" value={SUPPORT_EMAIL} />
                <Row label="Currency" value="INR (integer paise)" />
                <Row
                  label="Order reservations"
                  value={<Badge variant="outline">15 minutes</Badge>}
                />
                <Row label="Low-stock threshold" value="5 units" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="size-4" /> Transactional email
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Row label="Provider" value="Resend (configured via API env)" />
                <Row label="Verification" value="Required before checkout" />
                <Row label="Order updates" value="Paid · shipped · delivered · cancelled" />
                <Row label="Refund receipts" value="Sent on captured refunds" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="shipping">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="size-4" /> Shipping
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Row
                  label="Flat shipping fee"
                  value={formatPaise(FLAT_SHIPPING_FEE)}
                />
                <Row
                  label="Free shipping over"
                  value={formatPaise(FREE_SHIPPING_THRESHOLD)}
                />
                <Row label="Serviceable region" value="India" />
                <Row label="Carrier handoff" value="Per-order tracking + carrier" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BadgeIndianRupee className="size-4" /> Tax &amp; payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Row label="Tax basis" value="GST, computed server-side" />
                <Row label="Payment gateway" value="Razorpay (mock when keys absent)" />
                <Row label="Mock mode" value={<Badge variant="warning">Dev only</Badge>} />
                <Row label="Refund policy" value="Full or partial, ≤ refundable" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="size-4" /> Expired reservations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Checkout holds stock for 15 minutes. The sweeper normally runs in the
                  background; run it on demand after a failed payment burst or before an
                  inventory audit.
                </p>
                <Button onClick={() => sweep.mutate()} disabled={sweep.isPending}>
                  {sweep.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
                  Run reservation sweep now
                </Button>
                <p className="text-xs text-muted-foreground">
                  Writes an audit entry (<code>maintenance.reservation_sweep</code>) with the
                  count released.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="size-4" /> Reconciliation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The payment webhook is the source of truth. If a capture is confirmed by
                  Razorpay but the order is still pending, the success page polls until the
                  webhook lands.
                </p>
                <p>
                  Analytics figures follow captured payments on PAID, SHIPPED and DELIVERED
                  orders, net of partial refunds.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="runbooks">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              {
                icon: CreditCard,
                title: "Payments",
                body: "Rotate the Razorpay webhook secret in the API env, redeploy, then replay any failed webhooks from the Razorpay dashboard. Verify with a mock checkout first.",
              },
              {
                icon: Truck,
                title: "Shipping & tax",
                body: "Change shipping constants and tax rate in the API env. Requote an existing cart in a private window to confirm the new totals before announcing.",
              },
              {
                icon: Mail,
                title: "Emails",
                body: "Check the Resend domain status and DKIM records. Password-reset and verification links use the configured app URL, so keep it aligned with the public origin.",
              },
            ].map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <item.icon className="size-4" /> {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
