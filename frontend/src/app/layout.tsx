import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/shared/json-ld";
import { organizationJsonLd, SITE_URL } from "@/lib/seo";
import { STORE_NAME, STORE_TAGLINE } from "@/lib/constants";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${STORE_NAME} — ${STORE_TAGLINE}`,
    template: `%s · ${STORE_NAME}`,
  },
  description:
    "A considered collection of electronics, apparel, accessories and home goods. Free shipping over ₹999, easy 14-day returns.",
  applicationName: STORE_NAME,
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#201c18" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <JsonLd data={organizationJsonLd()} />
      </body>
    </html>
  );
}
