"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { SORT_OPTIONS } from "@/lib/constants";

export function SortSelect({
  value,
  params,
}: {
  value: string;
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label="Sort products"
      value={value}
      disabled={pending}
      className="h-9 w-44 text-xs"
      onChange={(e) => {
        const next = new URLSearchParams();
        Object.entries(params).forEach(([key, v]) => {
          if (v && key !== "sort" && key !== "page") next.set(key, v);
        });
        if (e.target.value !== "newest") next.set("sort", e.target.value);
        startTransition(() => {
          router.push(`/products${next.toString() ? `?${next.toString()}` : ""}` as Route, {
            scroll: false,
          });
        });
      }}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
