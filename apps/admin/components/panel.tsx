import { cn } from "@/lib/utils";

export function Panel({
  className,
  padded = true,
  as: Comp = "div",
  ...props
}: React.ComponentProps<"div"> & {
  padded?: boolean;
  as?: "div" | "section";
}) {
  return (
    <Comp
      data-slot="panel"
      className={cn("min-w-0 border bg-card", padded && "p-4 sm:p-5", className)}
      {...props}
    />
  );
}
