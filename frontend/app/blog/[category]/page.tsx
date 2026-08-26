import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES, getPostsByCategory, formatDate } from "@/lib/posts";

export function generateStaticParams() {
  return CATEGORIES.filter((c) => !c.isApp).map((c) => ({ category: c.slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cat = CATEGORIES.find((c) => c.slug === category && !c.isApp);
  if (!cat) notFound();

  const posts = getPostsByCategory(category);

  return (
    <div className="min-h-screen bg-white text-zinc-800">
      {/* Header */}
      <header className="border-b border-zinc-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold text-zinc-900 tracking-tight hover:text-zinc-600 transition-colors">
            dataandmiles
          </Link>
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

      <main className="max-w-3xl mx-auto px-5 sm:px-6 py-14">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-10">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M9.78 11.78a.75.75 0 01-1.06 0L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 1.06L7.06 8l2.72 2.72a.75.75 0 010 1.06z" clipRule="evenodd"/>
          </svg>
          All categories
        </Link>

        {/* Heading */}
        <div className="mb-12">
          <div className="text-3xl mb-3">{cat.emoji}</div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-2">{cat.title}</h1>
          <p className="text-zinc-500">{cat.description}</p>
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <p className="text-zinc-400 text-sm">No posts yet. Check back soon.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${category}/${post.slug}`}
                className="group block py-6 first:pt-0"
              >
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h2 className="font-semibold text-zinc-900 group-hover:text-zinc-600 transition-colors mb-1">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-sm text-zinc-500 leading-relaxed">{post.excerpt}</p>
                    )}
                  </div>
                  {post.date && (
                    <span className="text-xs text-zinc-400 flex-shrink-0 mt-0.5">
                      {formatDate(post.date)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-100 mt-24">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8">
          <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Gabriele Roggero · dataandmiles.com</p>
        </div>
      </footer>
    </div>
  );
}
