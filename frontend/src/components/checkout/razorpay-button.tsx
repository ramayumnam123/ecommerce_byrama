"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import type { Order, RazorpayBlock } from "@/lib/types";
import { Button } from "@/components/ui/button";

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = { open: () => void; on?: (event: string, cb: () => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let scriptPromise: Promise<boolean> | null = null;

function loadCheckoutJs(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export function RazorpayButton({
  razorpay,
  prefill,
  onVerified,
  onError,
  disabled,
}: {
  razorpay: RazorpayBlock;
  prefill: { name?: string; email?: string; contact?: string };
  onVerified: (order: Order) => void;
  onError: (error: unknown) => void;
  disabled?: boolean;
}) {
  const [opening, setOpening] = React.useState(false);

  async function pay() {
    setOpening(true);
    const ready = await loadCheckoutJs();
    if (!ready || !window.Razorpay) {
      setOpening(false);
      onError(new Error("Could not load the payment window. Check your connection."));
      return;
    }

    const instance = new window.Razorpay({
      key: razorpay.key_id,
      amount: razorpay.amount,
      currency: razorpay.currency,
      name: "Maison",
      description: "Secure checkout",
      order_id: razorpay.order_id,
      prefill,
      theme: { color: "#8a5a33" },
      modal: {
        ondismiss: () => setOpening(false),
      },
      handler: async (response) => {
        try {
          const order = await unwrap(
            await api.POST("/api/checkout/verify", { body: response }),
          );
          onVerified(order);
        } catch (error) {
          onError(error);
        } finally {
          setOpening(false);
        }
      },
    });

    instance.open();
    setOpening(false);
  }

  return (
    <Button size="lg" className="w-full" onClick={pay} disabled={disabled || opening}>
      {opening ? <Loader2 className="animate-spin" /> : <Lock />}
      Pay {razorpay.currency === "INR" ? "securely" : `in ${razorpay.currency}`}
    </Button>
  );
}
