import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pages,
  basePath,
  params,
  className,
}: {
  page: number;
  pages: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  if (pages <= 1) return null;

  const hrefFor = (target: number) => {
    const qs = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    if (target > 1) qs.set("page", String(target));
    const query = qs.toString();
    return `${basePath}${query ? `?${query}` : ""}` as Route;
  };

  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const items = Array.from({ length: Math.min(5, pages) }, (_, i) => windowStart + i);

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-1", className)}>
      <Button variant="ghost" size="icon-sm" asChild disabled={page <= 1}>
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          aria-label="Previous page"
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
        >
          <ChevronLeft />
        </Link>
      </Button>
      {items.map((n) => (
        <Button
          key={n}
          variant={n === page ? "default" : "ghost"}
          size="icon-sm"
          asChild
          aria-current={n === page ? "page" : undefined}
        >
          <Link href={hrefFor(n)}>{n}</Link>
        </Button>
      ))}
      <Button variant="ghost" size="icon-sm" asChild disabled={page >= pages}>
        <Link
          href={hrefFor(Math.min(pages, page + 1))}
          aria-label="Next page"
          aria-disabled={page >= pages}
          tabIndex={page >= pages ? -1 : undefined}
        >
          <ChevronRight />
        </Link>
      </Button>
    </nav>
  );
}
