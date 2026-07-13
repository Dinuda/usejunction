import Image from "next/image";
import { cn } from "@/lib/utils";
import usejunctionLogo from "@/public/usejunction.png";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src={usejunctionLogo}
      alt="UseJunction"
      width={usejunctionLogo.width}
      height={usejunctionLogo.height}
      priority
      className={cn("h-10 w-auto", className)}
    />
  );
}
