import { localizedStorefrontHero } from "@supastore/contracts";
import { designCopy } from "../lib/design-copy";
import { HomeProducts } from "./home-products";
import { CatalogFilters } from "./catalog-filters";
import { readRequestPage } from "../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import Link from "./shopping-link";
import Image from "next/image";
import { policyPresentation } from "../lib/page-metadata";

import { ProductCard } from "./product-card";
import { catalogHref, catalogPath } from "../lib/catalog-navigation";
import { CatalogSort } from "./catalog-sort";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
export default async function Catalog({
  locale,
  query = {},
  showHero = false,
  collectionPage = false,
}: {
  locale: string;
  showHero?: boolean;
  collectionPage?: boolean;
  query?: {
    q?: string;
    category?: string;
    collection?: string;
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
  const catalog = await readRequestPage("catalog", locale, {
    ...query,
    home: showHero ? "1" : undefined,
  });
  const { result, store, facets, collections, collectionTitles, groups } =
    catalog;
  const m = designCopy(locale);
  const navigation = { ...query, collectionPage };
  const selectedCollection = collections.find(
    (item) => item.handle === query.collection,
  );
  const selectedCollectionTitle = collectionTitles.find(
    (item) => item.collectionId === selectedCollection?.id,
  );
  const clearFilters = {
    category: "",
    options: [],
    collection: collectionPage ? query.collection || "" : "",
  };
  const branding = showHero
    ? (await readRequestPage("layout", locale)).store
    : store;
  const hero = localizedStorefrontHero(
    branding?.storefrontHero,
    locale,
    branding?.defaultLocale,
  );
  const homeProducts = showHero
    ? await HomeProducts({
        locale,
        catalog,
      })
    : null;
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
      ...(!collectionPage && query.collection
        ? { collection: query.collection }
        : {}),
      sort: query.sort || "",
    });
    selectedOptions.forEach((value) => state.append("options", value));
    return `${catalogPath(locale, navigation)}?${state}`;
  };
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (result.page > lastPage) redirect(pageHref(lastPage));
  return (
    <>
      {collectionPage && selectedCollection ? (
        <header className="storefront-collection storefront-collection-heading">
          <Link href={`/${locale}/search`}>← {textFor(locale).all}</Link>
          <h1>{selectedCollectionTitle?.title ?? selectedCollection.title}</h1>
          <p>
            {selectedCollectionTitle?.description ??
              selectedCollection.description}
          </p>
          {selectedCollection.imageKey && (
            <Image
              src={`/api/assets?key=${encodeURIComponent(selectedCollection.imageKey)}&inline=1`}
              alt={
                selectedCollection.imageAlt ||
                selectedCollectionTitle?.title ||
                selectedCollection.title
              }
              width={1200}
              height={600}
              sizes="(max-width: 767px) 88vw, 1200px"
              className="mb-8 max-h-96 w-full object-cover"
            />
          )}
          <p>
            {result.total} {textFor(locale).ui.products.toLowerCase()}
          </p>
        </header>
      ) : showHero ? (
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
            <a className="catalog-hero-link" href="#products">
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
            {selectedCollection
              ? (selectedCollectionTitle?.title ?? selectedCollection.title)
              : query.category
                ? (groups.find((group) => group.slug === query.category)
                    ?.name ?? t("all"))
                : query.q
                  ? t("search") + " · " + query.q
                  : t("all")}
          </h1>
          <p>
            {result.total} {textFor(locale).ui.products.toLowerCase()}
          </p>
        </header>
      )}
      {showHero ? (
        homeProducts
      ) : (
        <section id="collection">
          <div className="catalog-controls">
            <div className="storefront-catalog-tools">
              <form
                className="flex gap-2 max-sm:w-full"
                action={catalogPath(locale, navigation)}
              >
                <label className="sr-only" htmlFor="search">
                  {m.searchProducts}
                </label>
                <Input
                  id="search"
                  name="q"
                  placeholder={m.searchProducts}
                  defaultValue={query.q}
                />
                {query.category && (
                  <input type="hidden" name="category" value={query.category} />
                )}
                {query.collection && !collectionPage && (
                  <input
                    type="hidden"
                    name="collection"
                    value={query.collection}
                  />
                )}
                {query.sort && (
                  <input type="hidden" name="sort" value={query.sort} />
                )}
                {selectedOptions.map((value) => (
                  <input
                    key={value}
                    type="hidden"
                    name="options"
                    value={value}
                  />
                ))}
                <Button type="submit">{t("searchButton")}</Button>
              </form>
              {!showHero && (
                <CatalogSort
                  locale={locale}
                  query={{
                    q: query.q || "",
                    category: query.category || "",
                    collection: query.collection || "",
                    collectionPage,
                    sort: query.sort || "",
                    options: selectedOptions,
                  }}
                />
              )}
            </div>
            {!showHero && (
              <CatalogFilters
                key={JSON.stringify([
                  query.q,
                  query.category,
                  query.collection,
                  query.sort,
                  selectedOptions,
                ])}
                locale={locale}
                facets={facets}
                selected={selectedOptions}
                query={query.q || ""}
                sort={query.sort || "recommended"}
                category={query.category || ""}
                collection={query.collection || ""}
                collectionPage={collectionPage}
                categories={groups}
                collections={collections.map((collection) => ({
                  handle: collection.handle,
                  title:
                    collectionTitles.find(
                      (item) => item.collectionId === collection.id,
                    )?.title ?? collection.title,
                }))}
              />
            )}
          </div>
          {(query.category ||
            (!collectionPage && query.collection) ||
            selectedOptions.length > 0) && (
            <nav
              className="catalog-active-filters"
              aria-label={textFor(locale).ui.activeFilters}
            >
              {query.category && (
                <a href={catalogHref(locale, navigation, { category: "" })}>
                  {groups.find((group) => group.slug === query.category)
                    ?.name ?? query.category}
                  <span className="sr-only"> · {t("remove")}</span>{" "}
                  <span aria-hidden="true">×</span>
                </a>
              )}
              {!collectionPage && selectedCollection && (
                <a href={catalogHref(locale, navigation, { collection: "" })}>
                  {selectedCollectionTitle?.title ?? selectedCollection.title}
                  <span className="sr-only"> · {t("remove")}</span>{" "}
                  <span aria-hidden="true">×</span>
                </a>
              )}
              {selectedOptions.map((option) => (
                <a
                  key={option}
                  href={catalogHref(locale, navigation, {
                    options: selectedOptions.filter(
                      (value) => value !== option,
                    ),
                  })}
                >
                  {facets.find(
                    (facet) => `${facet.attribute}:${facet.value}` === option,
                  )?.label ?? option}
                  <span className="sr-only"> · {t("remove")}</span>{" "}
                  <span aria-hidden="true">×</span>
                </a>
              ))}
              <a href={catalogHref(locale, navigation, clearFilters)}>
                {textFor(locale).ui.clearFilters}
              </a>
            </nav>
          )}
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
                {query.q && <p>{textFor(locale).ui.searchRecovery}</p>}
                {query.category && (
                  <a href={catalogHref(locale, navigation, { category: "" })}>
                    {textFor(locale).ui.removeCategory}
                  </a>
                )}
                {(query.category ||
                  query.collection ||
                  selectedOptions.length > 0) && (
                  <a href={catalogHref(locale, navigation, clearFilters)}>
                    {textFor(locale).ui.clearFilters}
                  </a>
                )}
                <a href={`/${locale}/search`}>{t("all")}</a>
                {query.q && groups.length > 0 && (
                  <nav
                    className="search-recovery-categories"
                    aria-label={textFor(locale).ui.browseCategories}
                  >
                    <p>{textFor(locale).ui.browseCategories}</p>
                    {groups.slice(0, 6).map((group) => (
                      <a
                        key={group.id}
                        href={catalogHref(locale, {
                          ...navigation,
                          q: "",
                          category: group.slug,
                          options: [],
                        })}
                      >
                        {group.name}
                      </a>
                    ))}
                  </nav>
                )}
              </AlertDescription>
            </Alert>
          )}
          <nav
            className="storefront-pagination"
            aria-label={textFor(locale).ui.pagination}
          >
            {result.page > 1 && (
              <a href={pageHref(result.page - 1)}>
                ← {textFor(locale).common.previous}
              </a>
            )}
            {result.page * result.pageSize < result.total && (
              <a href={pageHref(result.page + 1)}>
                {textFor(locale).common.next} →
              </a>
            )}
            {result.total > 0 && (
              <p className="catalog-page-position">
                {textFor(locale)
                  .ui.pagePosition.replace("{page}", String(result.page))
                  .replace(
                    "{pages}",
                    String(Math.ceil(result.total / result.pageSize)),
                  )}{" "}
                ·{" "}
                {textFor(locale)
                  .ui.resultRange.replace(
                    "{first}",
                    String((result.page - 1) * result.pageSize + 1),
                  )
                  .replace(
                    "{last}",
                    String(
                      Math.min(result.page * result.pageSize, result.total),
                    ),
                  )
                  .replace("{total}", String(result.total))}
              </p>
            )}
          </nav>
          {!collectionPage && collections.length > 0 && (
            <Link
              className="collection-directory-link"
              href={`/${locale}/collections`}
            >
              {textFor(locale).ui.viewAllCollections} →
            </Link>
          )}
        </section>
      )}
    </>
  );
}
