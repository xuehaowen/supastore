import { readRequestPage } from "../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import Image from "next/image";
import { policyPresentation } from "../lib/page-metadata";
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
    await readRequestPage("catalog", locale, query);
  const facetAxes = [...new Set(facets.map((f) => f.attribute))].slice(0, 4);
  const featured = result.items.find((product) => product.coverImageKey);
  const about = policyPresentation(store, locale, "about")?.content;
  const introductionCharacters = Array.from(
    (about || t("subtitle")).replace(/\s+/g, " ").trim(),
  );
  const introduction =
    introductionCharacters.slice(0, 240).join("") +
    (introductionCharacters.length > 240 ? "…" : "");
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
        <section
          className={
            "catalog-hero" + (featured ? " catalog-hero-with-image" : "")
          }
        >
          <div className="catalog-hero-copy">
            <p className="catalog-hero-eyebrow">{t("collection")}</p>
            <h1>{store?.storeName || t("shop")}</h1>
            <p className="catalog-hero-description">{introduction}</p>
            <a className="catalog-hero-link" href="#collection">
              {t("collection")} <span aria-hidden="true">↓</span>
            </a>
          </div>
          {featured?.coverImageKey && (
            <Link
              className="catalog-hero-feature"
              href={`/${locale}/products/${featured.handle}`}
            >
              <div className="catalog-hero-image">
                <Image
                  src={`/api/assets?key=${encodeURIComponent(featured.coverImageKey)}&inline=1`}
                  alt={featured.title}
                  width={800}
                  height={800}
                  sizes="(max-width: 767px) 88vw, 42vw"
                  priority
                />
              </div>
              <span>
                {featured.title}
                <span aria-hidden="true"> ↗</span>
              </span>
            </Link>
          )}
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
