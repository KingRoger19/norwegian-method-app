import fs from "fs";
import path from "path";
import matter from "gray-matter";

const CONTENT_DIR = path.join(process.cwd(), "content");

export interface PostMeta {
  slug: string;
  category: string;
  title: string;
  date: string;
  excerpt: string;
}

export interface Post extends PostMeta {
  content: string;
}

export interface CategoryDef {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  isApp?: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "boring-stuff",
    title: "Boring Stuff",
    description: "Work, tech, and professional life. The less glamorous side of things.",
    emoji: "💼",
  },
  {
    slug: "running-journey",
    title: "My Running Journey",
    description: "Training logs, race reports, and reflections from roads and trails.",
    emoji: "🏃",
  },
  {
    slug: "equipment",
    title: "My Equipment",
    description: "Shoes, watches, and everything I use to run and track performance.",
    emoji: "👟",
  },
  {
    slug: "nutrition",
    title: "Nutrition & Integration",
    description: "Food, supplements, and the science behind fuelling for performance.",
    emoji: "🥗",
  },
  {
    slug: "training-approach",
    title: "My Training Approach",
    description: "The Norwegian Method, data-driven training, and the app I built.",
    emoji: "📊",
    isApp: true,
  },
];

export function getPostsByCategory(category: string): PostMeta[] {
  const dir = path.join(CONTENT_DIR, category);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const { data } = matter(raw);
      return {
        slug: file.replace(/\.mdx?$/, ""),
        category,
        title: data.title ?? file,
        date: data.date ?? "",
        excerpt: data.excerpt ?? "",
      };
    })
    .sort((a, b) => (b.date > a.date ? 1 : -1));
}

export function getPost(category: string, slug: string): Post | null {
  const candidates = [
    path.join(CONTENT_DIR, category, `${slug}.mdx`),
    path.join(CONTENT_DIR, category, `${slug}.md`),
  ];
  const fp = candidates.find((p) => fs.existsSync(p));
  if (!fp) return null;
  const raw = fs.readFileSync(fp, "utf-8");
  const { data, content } = matter(raw);
  return {
    slug,
    category,
    title: data.title ?? slug,
    date: data.date ?? "",
    excerpt: data.excerpt ?? "",
    content,
  };
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
