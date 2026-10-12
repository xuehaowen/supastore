import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/recover",
        "/en/account",
        "/zh/account",
        "/en/orders/",
        "/zh/orders/",
        "/en/checkout",
        "/zh/checkout",
        "/en/cart",
        "/zh/cart",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
