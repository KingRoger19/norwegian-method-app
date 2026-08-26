import { MetadataRoute } from "next";
import { CATEGORIES, getPostsByCategory } from "@/lib/posts";

const BASE = "https://dataandmiles.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const categoryRoutes = CATEGORIES.filter((c) => !c.isApp).map((cat) => ({
    url: `${BASE}/blog/${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const postRoutes = CATEGORIES.filter((c) => !c.isApp).flatMap((cat) =>
    getPostsByCategory(cat.slug).map((post) => ({
      url: `${BASE}/blog/${cat.slug}/${post.slug}`,
      lastModified: post.date ? new Date(post.date) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }))
  );

  return [
    { url: BASE, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    ...categoryRoutes,
    ...postRoutes,
  ];
}
