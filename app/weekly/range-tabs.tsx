import Link from "next/link";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { key: "14", label: "14d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
] as const;

export function RangeTabs({ active }: { active: string }) {
  return (
    <div className="flex w-full overflow-hidden rounded-full border bg-secondary/50 text-sm">
      {OPTIONS.map((o) => (
        <Link
          key={o.key}
          href={`/weekly?range=${o.key}`}
          replace
          scroll={false}
          className={cn(
            "flex-1 py-1.5 text-center transition-colors",
            o.key === active
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
