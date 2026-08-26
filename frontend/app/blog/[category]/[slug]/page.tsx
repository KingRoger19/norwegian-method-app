import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { CATEGORIES, getPost, getPostsByCategory, formatDate } from "@/lib/posts";

export function generateStaticParams() {
  return CATEGORIES.filter((c) => !c.isApp).flatMap((cat) =>
    getPostsByCategory(cat.slug).map((post) => ({
      category: cat.slug,
      slug: post.slug,
    }))
  );
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const cat = CATEGORIES.find((c) => c.slug === category && !c.isApp);
  if (!cat) notFound();

  const post = getPost(category, slug);
  if (!post) notFound();

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
        <Link
          href={`/blog/${category}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-10"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M9.78 11.78a.75.75 0 01-1.06 0L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 1.06L7.06 8l2.72 2.72a.75.75 0 010 1.06z" clipRule="evenodd"/>
          </svg>
          {cat.title}
        </Link>

        {/* Post header */}
        <div className="mb-10">
          {post.date && (
            <p className="text-sm text-zinc-400 mb-3">{formatDate(post.date)}</p>
          )}
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-3 leading-snug">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="text-zinc-500 leading-relaxed">{post.excerpt}</p>
          )}
        </div>

        <hr className="border-zinc-100 mb-10" />

        {/* MDX content */}
        <article className="prose prose-zinc prose-sm sm:prose max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-zinc-900
          prose-p:text-zinc-600 prose-p:leading-relaxed
          prose-a:text-zinc-900 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-zinc-600
          prose-strong:text-zinc-800
          prose-li:text-zinc-600
          prose-hr:border-zinc-100
          prose-blockquote:border-zinc-200 prose-blockquote:text-zinc-500
          prose-code:text-zinc-800 prose-code:bg-zinc-50 prose-code:px-1 prose-code:rounded">
          <MDXRemote source={post.content} />
        </article>
      </main>

      <footer className="border-t border-zinc-100 mt-24">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8">
          <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Gabriele Roggero · dataandmiles.com</p>
        </div>
      </footer>
    </div>
  );
}
