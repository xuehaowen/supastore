import { localizedStorefrontHero } from "@supastore/contracts";
import { designCopy } from "../lib/design-copy";
import { CatalogFilters } from "./catalog-filters";
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
    await readRequestPage("catalog", locale, {
      ...query,
      home: showHero ? "1" : undefined,
    });
  const m = designCopy(locale);
  const branding = showHero
    ? (await readRequestPage("layout", locale)).store
    : store;
  const hero = localizedStorefrontHero(
    branding?.storefrontHero,
    locale,
    branding?.defaultLocale,
  );
  const featuredCollections = showHero
    ? (branding?.storefrontHero?.featuredCollectionIds ?? []).flatMap((id) => {
        const collection = collections.find((item) => item.id === id);
        return collection ? [collection] : [];
      })
    : [];
  const about = policyPresentation(branding, locale, "about")?.content;
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
            "catalog-hero" + (hero?.imageKey ? " catalog-hero-with-image" : "")
          }
        >
          <div className="catalog-hero-copy">
            <p className="catalog-hero-eyebrow">{m.edit}</p>
            <h1>{hero?.heading || branding?.storeName || t("shop")}</h1>
            <p className="catalog-hero-description">
              {hero?.body || introduction}
            </p>
            <a className="catalog-hero-link" href="#collection">
              {m.browse} <span aria-hidden="true">↓</span>
            </a>
          </div>
          {hero?.imageKey && (
            <div
              className="catalog-hero-image"
              data-position={
                branding?.storefrontHero?.imagePosition ?? "center"
              }
            >
              <Image
                src={`/api/assets?key=${encodeURIComponent(hero.imageKey)}&inline=1`}
                alt={hero.imageAlt || hero.heading || branding?.storeName || ""}
                width={1000}
                height={900}
                sizes="(max-width: 767px) 100vw, 50vw"
                priority
              />
            </div>
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
        {featuredCollections.length > 0 && (
          <section
            className="catalog-featured-collections"
            aria-labelledby="featured-collections-heading"
          >
            <h2 id="featured-collections-heading">{m.featuredCollections}</h2>
            <div>
              {featuredCollections.map((collection) => {
                const translated = collectionTitles.find(
                  (item) => item.collectionId === collection.id,
                );
                return (
                  <Link
                    key={collection.id}
                    href={`/${locale}/collections/${collection.handle}`}
                  >
                    {collection.imageKey && (
                      <Image
                        src={`/api/assets?key=${encodeURIComponent(collection.imageKey)}&inline=1`}
                        alt={
                          collection.imageAlt ||
                          translated?.title ||
                          collection.title
                        }
                        width={600}
                        height={400}
                        sizes="(max-width: 767px) 90vw, 30vw"
                      />
                    )}
                    <span>
                      {translated?.title || collection.title}
                      <span aria-hidden="true">↗</span>
                    </span>
                    {(translated?.description || collection.description) && (
                      <p>{translated?.description || collection.description}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        {collections.some(
          (collection) =>
            !featuredCollections.some((item) => item.id === collection.id),
        ) && (
          <nav
            className="catalog-collection-nav"
            aria-label={textFor(locale).ui.collections}
          >
            {collections
              .filter(
                (collection) =>
                  !featuredCollections.some(
                    (item) => item.id === collection.id,
                  ),
              )
              .map((collection) => (
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
          <h2>{m.collection}</h2>
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
            {selectedOptions.map((value) => (
              <input key={value} type="hidden" name="options" value={value} />
            ))}
            <Button type="submit">{t("searchButton")}</Button>
          </Form>
        </div>
        <nav
          className="catalog-category-nav"
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
        <CatalogFilters
          key={JSON.stringify([
            query.q,
            query.category,
            query.sort,
            selectedOptions,
          ])}
          locale={locale}
          facets={facets}
          selected={selectedOptions}
          query={query.q || ""}
          sort={query.sort || "newest"}
          category={query.category || ""}
        />
        <div className="storefront-product-grid">
          {result.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              hasContextualRules={store?.hasContextualRules ?? false}
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
        <div className="storefront-pagination">
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
