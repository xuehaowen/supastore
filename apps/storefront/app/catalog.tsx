import { localizedStorefrontHero } from "@supastore/contracts";
import { designCopy } from "../lib/design-copy";
import { CatalogFilters } from "./catalog-filters";
import { CategoryNavigation } from "./category-navigation";
import { readRequestPage } from "../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import Image from "next/image";
import { policyPresentation } from "../lib/page-metadata";

import { ProductCard } from "./product-card";
import { catalogHref } from "../lib/catalog-navigation";
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
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (result.page > lastPage) redirect(pageHref(lastPage));
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
        <a
          className="collection-directory-link"
          href={`/${locale}/collections`}
        >
          {textFor(locale).ui.viewAllCollections}{" "}
          <span aria-hidden="true">→</span>
        </a>
        <div className="storefront-catalog-tools">
          <h2>{m.collection}</h2>
          <form
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
            {query.sort && (
              <input type="hidden" name="sort" value={query.sort} />
            )}
            {selectedOptions.map((value) => (
              <input key={value} type="hidden" name="options" value={value} />
            ))}
            <Button type="submit">{t("searchButton")}</Button>
          </form>
          <CatalogSort
            locale={locale}
            query={{
              q: query.q || "",
              category: query.category || "",
              sort: query.sort || "",
              options: selectedOptions,
            }}
          />
        </div>
        <nav
          className="catalog-category-nav"
          aria-label={textFor(locale).common.categories}
        >
          <a
            className={
              "rounded-full border px-3 py-1.5 no-underline transition-colors " +
              (!query.category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent hover:border-border hover:bg-muted")
            }
            href={catalogHref(locale, query, { category: "" })}
            aria-current={query.category ? undefined : "page"}
          >
            {t("all")}
          </a>
          <CategoryNavigation groups={groups} locale={locale} query={query} />
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
        {(query.category || selectedOptions.length > 0) && (
          <nav
            className="catalog-active-filters"
            aria-label={textFor(locale).ui.activeFilters}
          >
            {query.category && (
              <a href={catalogHref(locale, query, { category: "" })}>
                {groups.find((group) => group.slug === query.category)?.name ??
                  query.category}
                <span className="sr-only"> · {t("remove")}</span>{" "}
                <span aria-hidden="true">×</span>
              </a>
            )}
            {selectedOptions.map((option) => (
              <a
                key={option}
                href={catalogHref(locale, query, {
                  options: selectedOptions.filter((value) => value !== option),
                })}
              >
                {facets.find(
                  (facet) => `${facet.attribute}:${facet.value}` === option,
                )?.label ?? option}
                <span className="sr-only"> · {t("remove")}</span>{" "}
                <span aria-hidden="true">×</span>
              </a>
            ))}
            <a href={catalogHref(locale, query, { category: "", options: [] })}>
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
              {(query.category || selectedOptions.length > 0) && (
                <a
                  href={catalogHref(locale, query, {
                    category: "",
                    options: [],
                  })}
                >
                  {textFor(locale).ui.clearFilters}
                </a>
              )}
              <a href={"/" + locale}>{t("all")}</a>
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
                        category: group.slug,
                        sort: query.sort || "",
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
                  String(Math.min(result.page * result.pageSize, result.total)),
                )
                .replace("{total}", String(result.total))}
            </p>
          )}
        </nav>
      </section>
    </>
  );
}
