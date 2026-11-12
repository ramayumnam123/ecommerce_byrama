import Link from "next/link";
import type { Route } from "next";
import { Camera, Users, Play, Mail, MapPin } from "lucide-react";
import { STORE_NAME, STORE_TAGLINE, SUPPORT_EMAIL } from "@/lib/constants";
import { NewsletterForm } from "./newsletter-form";

const columns: { title: string; links: { label: string; href: Route }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All products", href: "/products" },
      { label: "Electronics", href: "/categories/electronics" as Route },
      { label: "Apparel", href: "/categories/apparel" as Route },
      { label: "Accessories", href: "/categories/accessories" as Route },
      { label: "Home & Kitchen", href: "/categories/home-kitchen" as Route },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "My account", href: "/account" },
      { label: "Orders", href: "/account/orders" },
      { label: "Addresses", href: "/account/addresses" },
      { label: "Sign in", href: "/signin" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Shipping & returns", href: "/products" },
      { label: "Contact us", href: "/products" },
      { label: "Privacy", href: "/products" },
      { label: "Terms", href: "/products" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t bg-card">
      <div className="container-page grid gap-10 py-14 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-5">
          <div>
            <p className="text-lg font-semibold tracking-[0.24em]">
              {STORE_NAME.toUpperCase()}
            </p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground text-pretty">
              {STORE_TAGLINE}. Designed for daily rituals, made to last beyond the season.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              A note, occasionally
            </p>
            <NewsletterForm />
          </div>
          <div className="flex gap-1">
            {[Camera, Users, Play].map((Icon, i) => (
              <span
                key={i}
                className="flex size-9 items-center justify-center rounded-full border text-muted-foreground"
              >
                <Icon className="size-4" />
              </span>
            ))}
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {col.title}
            </p>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t">
        <div className="container-page flex flex-col gap-3 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {STORE_NAME}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" /> {SUPPORT_EMAIL}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Bengaluru, India
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
