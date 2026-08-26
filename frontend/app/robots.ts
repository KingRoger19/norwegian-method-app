import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/advanced-metrics", "/athlete-settings", "/wiki", "/training-plan", "/nutrition", "/login"],
    },
    sitemap: "https://dataandmiles.com/sitemap.xml",
  };
}
