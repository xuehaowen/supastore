import {
  readSitemapCounts,
  readSitemapEntries,
  customerSitemapEntries,
  sitemapResponse,
} from "../../../lib/customer-sitemap";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> },
) {
  const name = (await params).page;
  if (name === "static.xml")
    return sitemapResponse(
      customerSitemapEntries(await readSitemapEntries("static")),
    );
  const match =
    /^(?:(products|categories|collections)-)?([1-9]\d{0,4})\.xml$/.exec(name);
  if (!match) return new Response(null, { status: 404 });
  const resource = (match[1] || "products") as
    "products" | "categories" | "collections";
  const page = Number(match[2]);
  if (page > 49999) return new Response(null, { status: 404 });
  const counts = await readSitemapCounts();
  if (page > Math.ceil(counts[resource] / 1000))
    return new Response(null, { status: 404 });
  return sitemapResponse(
    customerSitemapEntries(await readSitemapEntries(resource, page)),
  );
}
