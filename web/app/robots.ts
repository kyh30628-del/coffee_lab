import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/owner"] },
    sitemap: "https://dongnecoffeenote.com/sitemap.xml",
    host: "https://dongnecoffeenote.com",
  };
}
