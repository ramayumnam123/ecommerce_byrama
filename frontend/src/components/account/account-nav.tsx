"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore, useSignOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const links: { href: Route; label: string }[] = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/reviews", label: "Reviews" },
];

export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useSignOut();

  return (
    <div className="border-b bg-card">
      <div className="container-page flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials(user?.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{user?.full_name ?? "Your account"}</p>
            <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/products">Continue shopping</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
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
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
      <div className="container-page">
        <nav className="-mb-px flex gap-1 overflow-x-auto no-scrollbar" aria-label="Account">
          {links.map((link) => {
            const active =
              link.href === "/account"
                ? pathname === "/account"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors",
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
