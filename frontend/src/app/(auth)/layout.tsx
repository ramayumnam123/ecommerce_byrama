import Link from "next/link";
import { STORE_NAME, STORE_TAGLINE } from "@/lib/constants";
import { BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[oklch(0.24_0.02_60)] p-10 text-[oklch(0.97_0.01_85)] lg:flex">
        <span className="pointer-events-none absolute -right-20 top-24 size-72 rounded-full border border-white/10" />
        <span className="pointer-events-none absolute -bottom-24 -left-10 size-80 rounded-full border border-white/10" />
        <Link href="/" className="relative text-lg font-semibold tracking-[0.24em]">
          {STORE_NAME.toUpperCase()}
        </Link>
        <div className="relative max-w-md space-y-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/50">
            {STORE_TAGLINE}
          </p>
          <h2 className="text-3xl font-medium leading-tight tracking-tight text-balance">
            Fewer, better things. Kept for years, not seasons.
          </h2>
          <ul className="space-y-3 text-sm text-white/65">
            <li className="flex items-center gap-2.5">
              <Sparkles className="size-4" /> Early access to new arrivals
            </li>
            <li className="flex items-center gap-2.5">
              <BadgeCheck className="size-4" /> Faster checkout with saved addresses
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4" /> Secure payments and easy returns
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-white/35">
          © {new Date().getFullYear()} {STORE_NAME}
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 inline-block text-base font-semibold tracking-[0.24em] lg:hidden"
          >
            {STORE_NAME.toUpperCase()}
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
