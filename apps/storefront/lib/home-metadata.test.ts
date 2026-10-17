import { expect, it, vi } from "vitest";
import { pages } from "../../../tests/fixtures/customer-pages";
vi.mock("../app/catalog", () => ({ default: () => null }));
vi.mock("./page-data", () => ({ readRequestPage: vi.fn(async (page: keyof typeof pages) => page === "catalog" ? { ...pages.catalog, result: { ...pages.catalog.result, page: 2 } } : pages[page]) }));
import { generateMetadata } from "../app/[locale]/page";
it("keeps the second home catalog page canonical instead of collapsing it to page one", async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ page: "2" }) });
  expect(metadata.alternates?.canonical).toBe("http://localhost:3001/en?page=2");
});
