import type { Metadata } from "next";
import Link from "next/link";
import { STORE_NAME } from "@/lib/constants";
import { buildMetadata } from "@/lib/seo";
import { AccountNav } from "@/components/account/account-nav";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { Footer } from "@/components/storefront/footer";

export const metadata: Metadata = buildMetadata({
  title: "My account",
  path: "/account",
  noIndex: true,
});

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-background">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href="/" className="text-base font-semibold tracking-[0.24em]">
            {STORE_NAME.toUpperCase()}
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to store
          </Link>
        </div>
      </header>
      <AccountNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
