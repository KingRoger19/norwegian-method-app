import Link from "next/link";
import { CATEGORIES, getPostsByCategory } from "@/lib/posts";

export const metadata = {
  title: "dataandmiles",
  description: "Running, training, nutrition, and a bit of everything else.",
};

export default function BlogHome() {
  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [c.slug, getPostsByCategory(c.slug).length])
  );

  return (
    <div className="min-h-screen bg-white text-zinc-800">
      {/* Header */}
      <header className="border-b border-zinc-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-zinc-900 tracking-tight">dataandmiles</span>
          <Link
            href="/dashboard"
            className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1"
          >
            Open App
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06L7.28 11.78a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-6 py-16">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="text-3xl font-bold text-zinc-900 mb-4 tracking-tight">
            Hi, I&apos;m Gabriele.
          </h1>
          <p className="text-lg text-zinc-500 leading-relaxed max-w-xl">
            I run a lot, work in tech, and think too much about training data.
            This is where I write about all of it.
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-3">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={cat.isApp ? "/dashboard" : `/blog/${cat.slug}`}
              className="group flex items-start gap-5 p-5 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-all"
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-zinc-900 group-hover:text-zinc-700 transition-colors">
                    {cat.title}
                  </h2>
                  {!cat.isApp && counts[cat.slug] > 0 && (
                    <span className="text-xs text-zinc-400 flex-shrink-0">
                      {counts[cat.slug]} {counts[cat.slug] === 1 ? "post" : "posts"}
                    </span>
                  )}
                  {cat.isApp && (
                    <span className="text-xs text-zinc-400 flex-shrink-0 flex items-center gap-0.5">
                      Open app
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5">
                        <path fillRule="evenodd" d="M4.22 3.22a.75.75 0 011.06 0l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 01-1.06-1.06L6.19 6 4.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd"/>
                      </svg>
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-500 mt-0.5 leading-relaxed">
                  {cat.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-100 mt-24">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8">
          <p className="text-xs text-zinc-400">
            © {new Date().getFullYear()} Gabriele Roggero · dataandmiles.com
          </p>
        </div>
      </footer>
    </div>
  );
}
