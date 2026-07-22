import Link from "next/link";
import type { BlogInline } from "@/content/types";

export function BlogInlineContent({ content }: { content: BlogInline[] }) {
  return content.map((part, index) => {
    const value = part.strong ? <strong className="font-semibold text-foreground">{part.text}</strong> : part.text;
    if (!part.href) return <span key={`${part.text}-${index}`}>{value}</span>;
    const external = part.href.startsWith("http");
    return (
      <Link
        key={`${part.href}-${index}`}
        href={part.href}
        className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {value}
      </Link>
    );
  });
}
