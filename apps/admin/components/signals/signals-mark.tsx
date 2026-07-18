import { cn } from "@/lib/utils";

/** Signals nav mark — `public/icons/turn-up-branch.svg`. */
export function SignalsMark({
  className,
  ...props
}: React.ComponentProps<"img">) {
  return (
    <img
      src="/icons/turn-up-branch.svg"
      alt=""
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  );
}
