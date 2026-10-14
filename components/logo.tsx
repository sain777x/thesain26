import Link from "next/link";
import { cn } from "cn";

export function Logo({
  inverted = false,
  href = "/",
}: {
  inverted?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 font-heading text-lg tracking-tight",
        inverted ? "text-white" : "text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-7 place-items-center rounded-md text-[11px] font-semibold",
          inverted
            ? "bg-white text-[#143028]"
            : "bg-primary text-primary-foreground",
        )}
      >
        26
      </span>
      thesain26
    </Link>
  );
}
