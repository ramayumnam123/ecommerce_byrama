"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, ShoppingBag, Menu, User } from "lucide-react";
import type { Category, User as UserType } from "@/lib/types";
import { useAuthStore, useSignOut } from "@/lib/auth";
import { useCartCount, useCartStore } from "@/lib/cart-store";
import { STORE_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { initials } from "@/lib/utils";
import { toast } from "sonner";

function AccountMenu() {
  const user = useAuthStore((s) => s.user) as UserType | null;
  const router = useRouter();
  const signOut = useSignOut();

  if (!user) {
    return (
      <Button variant="ghost" size="icon" asChild aria-label="Sign in">
        <Link href="/signin">
          <User className="size-[18px]" />
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials(user.full_name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-foreground">{user.full_name}</span>
          <span className="block truncate text-xs font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">Overview</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/orders">Orders</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/addresses">Addresses</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/reviews">My reviews</Link>
        </DropdownMenuItem>
        {user.role === "ADMIN" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">Admin dashboard</Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onClick={() =>
            signOut.mutate(undefined, {
              onSuccess: () => {
                toast.success("Signed out");
                router.push("/");
                router.refresh();
              },
            })
          }
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header({ categories }: { categories: Category[] }) {
  const count = useCartCount();
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const user = useAuthStore((s) => s.user);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const nav = [
    { href: "/products" as Route, label: "Shop all" },
    ...categories.map((c) => ({
      href: `/categories/${c.slug}` as Route,
      label: c.name,
    })),
  ];

  return (
    <>
      <div className="bg-primary text-primary-foreground">
        <div className="container-page flex h-9 items-center justify-center text-center text-[11px] tracking-[0.14em] uppercase">
          Complimentary shipping over ₹999 · 14-day returns · Secure payments
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
        <div className="container-page flex h-16 items-center gap-3">
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="font-semibold tracking-[0.22em]"
                >
                  {STORE_NAME.toUpperCase()}
                </Link>
                <nav className="mt-4 flex flex-col gap-1" aria-label="Mobile">
                  {nav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md px-2 py-2.5 text-sm hover:bg-accent"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="my-2 h-px bg-border" />
                  <Link
                    href="/account"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-2 py-2.5 text-sm hover:bg-accent"
                  >
                    {user ? "My account" : "Sign in"}
                  </Link>
                  {user?.role === "ADMIN" ? (
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md px-2 py-2.5 text-sm hover:bg-accent"
                    >
                      Admin
                    </Link>
                  ) : null}
                </nav>
                <div className="mt-auto flex items-center gap-2 border-t pt-4">
                  <ThemeToggle />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <Link
            href="/"
            className="mr-2 shrink-0 text-lg font-semibold tracking-[0.24em]"
            aria-label={`${STORE_NAME} home`}
          >
            {STORE_NAME.toUpperCase()}
          </Link>

          <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
            {nav.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            {nav.length > 5 ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="text-[13px] text-muted-foreground hover:text-foreground">
                  More
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {nav.slice(5).map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              onClick={() => setSearchOpen((v) => !v)}
              className="sm:hidden"
            >
              <Search className="size-[18px]" />
            </Button>
            <form
              action="/products"
              method="get"
              className="relative hidden w-52 items-center md:flex"
              role="search"
            >
              <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <input
                type="search"
                name="q"
                placeholder="Search the collection"
                aria-label="Search products"
                className="h-9 w-full rounded-full border bg-secondary/60 pl-9 pr-3 text-xs outline-none transition-colors focus:border-ring focus:bg-background"
              />
            </form>
            <ThemeToggle />
            <AccountMenu />
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => setDrawerOpen(true)}
              aria-label={`Shopping bag, ${count} items`}
            >
              <ShoppingBag className="size-[18px]" />
              {count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[oklch(0.58_0.12_48)] px-1 text-[10px] leading-4 text-white">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Button>
          </div>
        </div>

        {searchOpen ? (
          <form action="/products" method="get" className="container-page pb-3 sm:hidden" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                autoFocus
                placeholder="Search the collection"
                aria-label="Search products"
                className="h-10 w-full rounded-full border bg-secondary/60 pl-9 pr-3 text-sm outline-none focus:border-ring focus:bg-background"
              />
            </div>
          </form>
        ) : null}
      </header>
    </>
  );
}
