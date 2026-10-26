import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[62vh] flex-col items-center justify-center gap-5 py-20 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        404
      </p>
      <h1 className="max-w-lg text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        This page has gone out of stock.
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The link may be old, or the piece may have sold out. Explore the collection
        instead — new arrivals land every week.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/products">Browse the collection</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}
