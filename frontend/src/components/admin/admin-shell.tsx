"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn, initials } from "@/lib/utils";
import { useAuthStore, useMe, useSignOut } from "@/lib/auth";
import { getSessionHint } from "@/lib/session";
import { STORE_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const NAV: {
  group: string;
  items: { href: Route; label: string; icon: React.ComponentType<{ className?: string }> }[];
}[] = [
  {
    group: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    group: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/categories", label: "Categories", icon: Boxes },
    ],
  },
  {
    group: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
      { href: "/admin/coupons", label: "Coupons", icon: Percent },
      { href: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: ClipboardList },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4" aria-label="Admin">
      {NAV.map((group) => (
        <div key={group.group} className="space-y-1">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {group.group}
          </p>
          {group.items.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-auto space-y-1 border-t pt-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <Store className="size-4" /> View storefront
        </Link>
      </div>
    </nav>
  );
}

function AdminUserMenu() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full pl-1 pr-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Admin account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials(user?.full_name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-foreground">
            {user?.full_name ?? "Admin"}
          </span>
          <span className="block truncate text-xs font-normal">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">Customer account</Link>
        </DropdownMenuItem>
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
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function titleFor(pathname: string) {
  if (pathname === "/admin") return "Dashboard";
  const match = NAV.flatMap((g) => g.items)
    .filter((i) => i.href !== "/admin")
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname.startsWith(i.href));
  return match?.label ?? "Admin";
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [denied, setDenied] = React.useState(false);
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const me = useMe();

  const hintedAdmin = React.useMemo(() => {
    const hint = getSessionHint();
    return hint?.role === "ADMIN";
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const confirmed = user?.role === "ADMIN" || me.data?.role === "ADMIN";
    if (confirmed) return;
    if (me.isLoading) return;

    if (!user && !hintedAdmin && !me.data) {
      setDenied(true);
      router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setDenied(true);
    router.replace("/account?denied=admin");
  }, [ready, user, me.data, me.isLoading, hintedAdmin, router, pathname]);

  const confirmedAdmin = user?.role === "ADMIN" || me.data?.role === "ADMIN";

  if (!ready || (!confirmedAdmin && !denied)) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 border-r bg-sidebar lg:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!confirmedAdmin) return null;

  return (
    <div className="flex min-h-dvh bg-muted/20">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <ShieldCheck className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold tracking-[0.18em]">
              {STORE_NAME.toUpperCase()}
            </p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Admin console
            </p>
          </div>
        </div>
        <NavLinks />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open admin menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-16 items-center gap-2 border-b px-5">
                  <ShieldCheck className="size-5 text-muted-foreground" />
                  <p className="text-sm font-semibold tracking-[0.18em]">
                    {STORE_NAME.toUpperCase()}
                  </p>
                </div>
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{titleFor(pathname)}</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Operations &amp; catalogue
              </p>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/" target="_blank" rel="noreferrer">
                  <Store /> Storefront
                </Link>
              </Button>
              <ThemeToggle />
              <AdminUserMenu />
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="border-t px-4 py-4 text-[11px] text-muted-foreground sm:px-6 lg:px-8">
          {STORE_NAME} admin · every mutation is audit-logged
        </footer>
      </div>
    </div>
  );
}
