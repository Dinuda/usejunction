import { buildLlmsTxt } from "@/lib/public/llms-txt";

export function GET() {
  return new Response(buildLlmsTxt(true), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
