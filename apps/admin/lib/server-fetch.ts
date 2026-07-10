import { cookies } from "next/headers";
import { COOKIE_NAME } from "./session-edge";

function appBaseUrl(): string {
  return (
    process.env.INTERNAL_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://127.0.0.1:${process.env.PORT || process.env.ADMIN_PORT || 3001}`
  );
}

export async function serverFetch<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  const cookieHeader = sessionCookie ? `${COOKIE_NAME}=${sessionCookie.value}` : "";

  const url = path.startsWith("http") ? path : `${appBaseUrl()}${path}`;

  const res = await fetch(url, {
    headers: {
      cookie: cookieHeader,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`serverFetch ${path} → ${res.status}`);
  }

  return res.json() as Promise<T>;
}
