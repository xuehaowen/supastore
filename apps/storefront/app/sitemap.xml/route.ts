import {
  readSitemapCounts,
  customerSitemapIndex,
  sitemapResponse,
} from "../../lib/customer-sitemap";
export const dynamic = "force-dynamic";
export async function GET() {
  return sitemapResponse(customerSitemapIndex(await readSitemapCounts()));
}
