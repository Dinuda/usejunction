import { cookies } from "next/headers";

export async function serverFetch(path: string) {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3002";
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  if (!res.ok) return null;
  return res.json();
}
