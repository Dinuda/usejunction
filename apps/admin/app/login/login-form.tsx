"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Login failed");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="admin@example.com"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>
      {error && (
        <p className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-cyan-500 px-4 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
