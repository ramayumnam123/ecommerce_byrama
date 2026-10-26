"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, refreshAccessToken, unwrap } from "./api";
import { getAccessToken, setAccessToken, subscribeToken } from "./token";
import { getSessionHint, clearSessionHint, setSessionHint } from "./session";
import { useCartStore } from "./cart-store";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  ready: boolean;
  setUser: (user: User | null) => void;
  setReady: (ready: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  clear: () => set({ user: null }),
}));

/** Rehydrate the in-memory access token from the httpOnly refresh cookie. */
export async function bootstrapSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (getAccessToken()) return;
  // Only spend a refresh round-trip when this browser previously signed in.
  if (!getSessionHint()) return;
  await refreshAccessToken();
}

export async function signIn(email: string, password: string): Promise<User> {
  const pair = await unwrap(
    await api.POST("/api/auth/login", { body: { email, password } }),
  );
  setAccessToken(pair.access_token);
  setSessionHint(pair.user);
  useAuthStore.getState().setUser(pair.user);
  await useCartStore.getState().mergeGuest();
  await useCartStore.getState().refresh();
  return pair.user;
}

export async function signUp(input: {
  email: string;
  password: string;
  full_name: string;
}): Promise<User> {
  const pair = await unwrap(await api.POST("/api/auth/signup", { body: input }));
  setAccessToken(pair.access_token);
  setSessionHint(pair.user);
  useAuthStore.getState().setUser(pair.user);
  await useCartStore.getState().mergeGuest();
  await useCartStore.getState().refresh();
  return pair.user;
}

export async function signOut(): Promise<void> {
  try {
    await api.POST("/api/auth/logout");
  } catch {
    // local-first signout
  }
  setAccessToken(null);
  clearSessionHint();
  useAuthStore.getState().clear();
  useCartStore.getState().resetLocal();
}

/** Session-aware `me` query (docs/11 F2): 60s stale time. */
export function useMe() {
  const [hasToken, setHasToken] = useState(() => !!getAccessToken());
  useEffect(() => subscribeToken((t) => setHasToken(!!t)), []);

  const setUser = useAuthStore((s) => s.setUser);
  const ready = useAuthStore((s) => s.ready);

  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const user = await unwrap(await api.GET("/api/auth/me"));
      setUser(user);
      return user;
    },
    enabled: ready && hasToken,
    staleTime: 60_000,
    retry: false,
  });

  return query;
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: signUp,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => qc.clear(),
  });
}
