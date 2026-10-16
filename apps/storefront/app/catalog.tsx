import { readPage } from "../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import Form from "next/form";
import { ProductCard } from "./product-card";
import { NativeSelect } from "@supastore/ui/native-select";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
export default async function Catalog({
  locale,
  query = {},
  showHero = false,
}: {
  locale: string;
  showHero?: boolean;
  query?: {
    q?: string;
    category?: string;
    page?: string;
    sort?: string;
    options?: string | string[];
  };
}) {
  if (locale !== "en" && locale !== "zh") notFound();
  const t = await getTranslations({ locale });
  const selectedOptions = (
    Array.isArray(query.options) ? query.options : [query.options || ""]
  )
    .filter(Boolean)
    .slice(0, 4);
  const { result, store, facets, collections, collectionTitles, groups } =
    await readPage("catalog", locale, query);
  const facetAxes = [...new Set(facets.map((f) => f.attribute))].slice(0, 4);
  const pageHref = (page: number) => {
    const state = new URLSearchParams({
      page: String(page),
      q: query.q || "",
      category: query.category || "",
      sort: query.sort || "",
    });
    selectedOptions.forEach((value) => state.append("options", value));
    return `?${state}`;
  };
  return (
    <>
      {showHero ? (
        <section className="catalog-hero relative min-h-[480px] border-b py-18 pr-[48%] max-sm:min-h-[580px] max-sm:py-10 max-sm:pr-0">
          <p className="mb-7 text-[10px] font-bold tracking-[0.2em]">
            {textFor(locale).common.collectionEyebrow}
          </p>
          <h1 className="mb-7 font-serif text-5xl leading-none tracking-[-0.045em] md:text-7xl">
            {t("intro")}
          </h1>
          <p className="max-w-sm leading-7 text-muted-foreground">
            {t("subtitle")}
          </p>
          <a
            className="mt-6 inline-block border-b pb-1.5 text-sm no-underline"
            href="#collection"
          >
            {t("collection")} ↓
          </a>
          <div
            className="absolute top-0 right-0 -z-10 h-[90%] w-[43%] overflow-hidden rounded-t-full bg-[#e6e7d5] max-sm:top-auto max-sm:bottom-5 max-sm:h-60 max-sm:w-[65%]"
            aria-hidden="true"
          >
            <div className="absolute bottom-[15%] left-[20%] h-[50%] w-[37%] rounded-[30%_30%_42%_42%] bg-[#bc8962] shadow-xl" />
            <div className="absolute right-[7%] bottom-[22%] aspect-square w-[34%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f3eed2,#b3b89b)] shadow-xl" />
            <span className="absolute right-6 bottom-5 text-[9px] tracking-[0.22em]">
              {textFor(locale).common.lessButBetter}
            </span>
          </div>
        </section>
      ) : (
        <header className="storefront-catalog-heading">
          <h1>
            {query.category
              ? (groups.find((group) => group.slug === query.category)?.name ??
                t("all"))
              : query.q
                ? t("search") + " · " + query.q
                : t("all")}
          </h1>
          <p>
            {result.total} {textFor(locale).ui.products.toLowerCase()}
          </p>
        </header>
      )}
      <section id="collection">
        {collections.length > 0 && (
          <nav
            className="my-7 flex flex-wrap gap-3"
            aria-label={textFor(locale).ui.collections}
          >
            {collections.map((collection) => (
              <Link
                key={collection.id}
                href={`/${locale}/collections/${collection.handle}`}
              >
                {collectionTitles.find(
                  (item) => item.collectionId === collection.id,
                )?.title ?? collection.title}
              </Link>
            ))}
          </nav>
        )}
        <div className="storefront-catalog-tools">
          <h2>{t("collection")}</h2>
          <Form
            className="flex gap-2 max-sm:w-full"
            action={"/" + locale + "/search"}
          >
            <label className="sr-only" htmlFor="search">
              {t("search")}
            </label>
            <Input
              id="search"
              name="q"
              placeholder={t("search")}
              defaultValue={query.q}
            />
            {query.category && (
              <input type="hidden" name="category" value={query.category} />
            )}
            <label className="grid gap-2">
              {textFor(locale).ui.sort}
              <NativeSelect name="sort" defaultValue={query.sort || "newest"}>
                <option value="newest">{textFor(locale).ui.newest}</option>
                <option value="price-low">
                  {textFor(locale).ui.priceLowToHigh}
                </option>
                <option value="price-high">
                  {textFor(locale).ui.priceHighToLow}
                </option>
              </NativeSelect>
            </label>
            {facetAxes.map((axis) => (
              <label key={axis} className="grid gap-2">
                {facets.find((f) => f.attribute === axis)!.name}
                <NativeSelect
                  name="options"
                  defaultValue={
                    selectedOptions.find((v) => v.startsWith(`${axis}:`)) || ""
                  }
                >
                  <option value="">{t("all")}</option>
                  {facets
                    .filter((f) => f.attribute === axis)
                    .map((f) => (
                      <option key={f.value} value={`${axis}:${f.value}`}>
                        {f.label}
                      </option>
                    ))}
                </NativeSelect>
              </label>
            ))}
            <Button type="submit">{t("searchButton")}</Button>
          </Form>
        </div>
        <nav
          className="my-7 flex flex-wrap gap-2"
          aria-label={textFor(locale).common.categories}
        >
          <Link
            className={
              "rounded-full border px-3 py-1.5 no-underline transition-colors " +
              (!query.category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent hover:border-border hover:bg-muted")
            }
            href={"/" + locale}
            aria-current={query.category ? undefined : "page"}
          >
            {t("all")}
          </Link>
          {groups.map((g) => (
            <Link
              className={
                "rounded-full border px-3 py-1.5 no-underline transition-colors " +
                (query.category === g.slug
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-transparent hover:border-border hover:bg-muted")
              }
              key={g.id}
              href={"/" + locale + "/search?category=" + g.slug}
              aria-current={query.category === g.slug ? "page" : undefined}
            >
              {g.parentId ? <span aria-hidden="true">↳ </span> : null}
              {g.name}
            </Link>
          ))}
        </nav>
        <div className="storefront-product-grid">
          {result.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              locale={locale}
              currency={store?.currency}
              precision={store?.precision}
            />
          ))}
        </div>
        {!result.items.length && (
          <Alert className="storefront-empty">
            <AlertDescription>
              {textFor(locale).common.noProducts}
              <Link href={"/" + locale}>{t("all")}</Link>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-between py-7">
          {result.page > 1 && (
            <Link href={pageHref(result.page - 1)}>
              ← {textFor(locale).common.previous}
            </Link>
          )}
          {result.page * result.pageSize < result.total && (
            <Link href={pageHref(result.page + 1)}>
              {textFor(locale).common.next} →
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
