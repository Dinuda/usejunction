import Image from "next/image";
import usejunctionLogo from "@/public/usejunction.png";

export function Icon() {
  return (
    <Image
      src={usejunctionLogo}
      alt="UseJunction"
      width={32}
      height={32}
      className="size-8"
    />
  );
}
