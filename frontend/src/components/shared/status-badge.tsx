import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_TONE[status] ?? "outline"} className={className}>
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
      />
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
