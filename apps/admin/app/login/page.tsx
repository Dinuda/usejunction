import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — UseJunction",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0d14]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold tracking-tight text-cyan-400">UseJunction</div>
          <p className="mt-1 text-sm text-zinc-500">AI coding observability</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8">
          <h1 className="mb-6 text-lg font-semibold text-zinc-100">Admin sign in</h1>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-600">
          UseJunction Dashboard · Internal tool
        </p>
      </div>
    </div>
  );
}
