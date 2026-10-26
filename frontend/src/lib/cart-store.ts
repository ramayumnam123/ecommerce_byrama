"use client";

import { create } from "zustand";
import { api, refreshAccessToken, unwrap } from "./api";
import { ApiError } from "./errors";
import { getAccessToken } from "./token";
import {
  ensureGuestToken,
  getGuestToken,
  getSessionHint,
  clearGuestToken,
} from "./session";
import type { Cart } from "./types";

export const EMPTY_CART: Cart = {
  items: [],
  totals: { subtotal: 0, total_items: 0 },
};

export interface AppliedCoupon {
  code: string;
  discount: number;
  message: string;
}

interface CartState {
  cart: Cart;
  loading: boolean;
  hydrated: boolean;
  drawerOpen: boolean;
  coupon: AppliedCoupon | null;
  pendingVariantId: string | null;

  setDrawerOpen: (open: boolean) => void;
  setCoupon: (coupon: AppliedCoupon | null) => void;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clear: () => Promise<void>;
  mergeGuest: () => Promise<void>;
  resetLocal: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Cart update failed";
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: EMPTY_CART,
  loading: false,
  hydrated: false,
  drawerOpen: false,
  coupon: null,
  pendingVariantId: null,

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setCoupon: (coupon) => set({ coupon }),

  hydrate: async () => {
    if (get().hydrated) return;
    // Make sure a returning session's bearer token exists before the first
    // cart request; otherwise the server answers for the empty guest cart.
    if (!getAccessToken() && getSessionHint()) {
      await refreshAccessToken();
    }
    ensureGuestToken();
    await get().refresh();
    set({ hydrated: true });
  },

  refresh: async () => {
    set({ loading: true });
    try {
      const cart = await unwrap(
        await api.GET("/api/cart", {
          params: { header: { "x-guest-token": getGuestToken() ?? undefined } },
        }),
      );
      set({ cart, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addItem: async (variantId, quantity = 1) => {
    ensureGuestToken();
    set({ loading: true, pendingVariantId: variantId });
    try {
      const cart = await unwrap(
        await api.POST("/api/cart/items", {
          body: { product_variant_id: variantId, quantity },
          params: { header: { "x-guest-token": getGuestToken() ?? undefined } },
        }),
      );
      set({ cart, loading: false, pendingVariantId: null, drawerOpen: true });
    } catch (e) {
      set({ loading: false, pendingVariantId: null });
      throw new Error(errorMessage(e));
    }
  },

  updateQuantity: async (variantId, quantity) => {
    set({ loading: true, pendingVariantId: variantId });
    try {
      const cart = await unwrap(
        await api.PATCH("/api/cart/items/{variant_id}", {
          params: {
            path: { variant_id: variantId },
            header: { "x-guest-token": getGuestToken() ?? undefined },
          },
          body: { quantity },
        }),
      );
      set({ cart, loading: false, pendingVariantId: null });
    } catch (e) {
      set({ loading: false, pendingVariantId: null });
      throw new Error(errorMessage(e));
    }
  },

  removeItem: async (variantId) => {
    set({ loading: true, pendingVariantId: variantId });
    try {
      const cart = await unwrap(
        await api.DELETE("/api/cart/items/{variant_id}", {
          params: {
            path: { variant_id: variantId },
            header: { "x-guest-token": getGuestToken() ?? undefined },
          },
        }),
      );
      set({ cart, loading: false, pendingVariantId: null });
    } catch (e) {
      set({ loading: false, pendingVariantId: null });
      throw new Error(errorMessage(e));
    }
  },

  clear: async () => {
    set({ loading: true });
    try {
      const cart = await unwrap(
        await api.DELETE("/api/cart", {
          params: { header: { "x-guest-token": getGuestToken() ?? undefined } },
        }),
      );
      set({ cart, loading: false, coupon: null });
    } catch {
      set({ loading: false });
    }
  },

  mergeGuest: async () => {
    const guest = getGuestToken();
    if (!guest) return;
    try {
      const cart = await unwrap(
        await api.POST("/api/cart/merge", { body: { guest_token: guest } }),
      );
      clearGuestToken();
      set({ cart, coupon: null });
    } catch {
      // A failed merge (e.g. expired guest cart) must not block sign-in.
      await get().refresh();
    }
  },

  resetLocal: () => {
    clearGuestToken();
    set({ cart: EMPTY_CART, coupon: null, hydrated: false, drawerOpen: false });
  },
}));

export function useCart() {
  return useCartStore((s) => s.cart);
}

export function useCartCount() {
  return useCartStore((s) => s.cart.totals.total_items);
}

export function useCartSubtotal() {
  return useCartStore((s) => s.cart.totals.subtotal);
}
