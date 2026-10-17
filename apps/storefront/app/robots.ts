import type { MetadataRoute } from "next";
import { publicOrigin } from "../lib/seo";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/assets"],
      disallow: [
        "/api/",
        "/admin/",
        "/recover",
        "/en/account",
        "/zh/account",
        "/en/cart",
        "/zh/cart",
        "/en/checkout",
        "/zh/checkout",
        "/en/orders/",
        "/zh/orders/",
        "/en/recover",
        "/zh/recover",
      ],
    },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
