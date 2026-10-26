"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { bootstrapSession, useAuthStore } from "@/lib/auth";
import { useCartStore } from "@/lib/cart-store";
import type { User } from "@/lib/types";

function SessionBootstrap() {
  const setUser = useAuthStore((s) => s.setUser);
  const setReady = useAuthStore((s) => s.setReady);

  useEffect(() => {
    let active = true;
    const onRefreshed = (event: Event) => {
      const user = (event as CustomEvent<User>).detail;
      if (user) setUser(user);
    };
    window.addEventListener("auth:refreshed", onRefreshed);

    (async () => {
      await bootstrapSession();
      if (active) setReady(true);
    })();

    return () => {
      active = false;
      window.removeEventListener("auth:refreshed", onRefreshed);
    };
  }, [setReady, setUser]);

  return null;
}

function CartBootstrap() {
  const hydrate = useCartStore((s) => s.hydrate);
  const ready = useAuthStore((s) => s.ready);
  useEffect(() => {
    // Wait for the refresh-cookie bootstrap so a signed-in cart loads with the
    // bearer token instead of racing as an empty guest cart.
    if (!ready) return;
    void hydrate();
  }, [hydrate, ready]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap />
        <CartBootstrap />
        {children}
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
