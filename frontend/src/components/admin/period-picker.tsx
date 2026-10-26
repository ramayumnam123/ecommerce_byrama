"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { ADMIN_PERIODS } from "@/lib/constants";
import type { AnalyticsRange } from "@/lib/analytics-range";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function PeriodPicker({
  value,
  onChange,
  className,
}: {
  value: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
        {ADMIN_PERIODS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            size="sm"
            variant={value.period === preset.value ? "default" : "ghost"}
            className="h-7 px-2.5 text-[11px]"
            onClick={() =>
              onChange({
                period: preset.value,
                from: preset.value === "custom" ? value.from : undefined,
                to: preset.value === "custom" ? value.to : undefined,
              })
            }
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {value.period === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="analytics-from" className="text-[10px]">
              From
            </Label>
            <Input
              id="analytics-from"
              type="date"
              value={value.from ?? ""}
              max={value.to}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="h-9 w-[9.5rem]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="analytics-to" className="text-[10px]">
              To
            </Label>
            <Input
              id="analytics-to"
              type="date"
              value={value.to ?? ""}
              min={value.from}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="h-9 w-[9.5rem]"
            />
          </div>
          <span className="hidden items-center gap-1 pb-2 text-[11px] text-muted-foreground sm:flex">
            <CalendarDays className="size-3.5" /> inclusive dates
          </span>
        </div>
      ) : null}
    </div>
  );
}
