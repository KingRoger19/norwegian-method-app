"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/api";

const PREFILL_EMAIL = process.env.NEXT_PUBLIC_PREFILL_EMAIL ?? "";
const PREFILL_PASSWORD = process.env.NEXT_PUBLIC_PREFILL_PASSWORD ?? "";
const TOKEN_KEY = "nm_auth_token";
const CREDS_KEY = "nm_remembered";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(PREFILL_EMAIL);
  const [password, setPassword] = useState(PREFILL_PASSWORD);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (localStorage.getItem(TOKEN_KEY)) {
      router.replace("/dashboard");
      return;
    }
    const saved = localStorage.getItem(CREDS_KEY);
    if (saved) {
      try {
        const { email: e, password: p } = JSON.parse(saved);
        setEmail(e);
        setPassword(p);
        setRemember(true);
      } catch {}
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await loginUser(email, password);
      localStorage.setItem(TOKEN_KEY, token);
      if (remember) {
        localStorage.setItem(CREDS_KEY, JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem(CREDS_KEY);
      }
      router.push("/dashboard");
    } catch {
      setError("Invalid credentials. Check email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl">🏔</span>
            <span className="text-xl font-semibold tracking-tight text-zinc-100">
              Norwegian Method
            </span>
          </div>
          <p className="text-sm text-zinc-300">Training analytics dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-zinc-100 mb-6">
            Sign in
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 accent-blue-500 cursor-pointer"
              />
              <label
                htmlFor="remember"
                className="text-sm text-zinc-200 cursor-pointer select-none"
              >
                Remember me
              </label>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Coros Hub · Norwegian Method Analytics
        </p>
      </div>
    </div>
  );
}
