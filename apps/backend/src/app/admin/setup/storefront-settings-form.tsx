"use client";
import { useEffect, useRef, useState } from "react";
import type { StorefrontHero } from "@supastore/contracts";
import { saveStorefrontHero } from "@/app/actions/settings";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Textarea } from "@supastore/ui/textarea";
import { NativeSelect } from "@supastore/ui/native-select";
import { storefrontPreviewDocument } from "./storefront-preview";

type Choice = { id: string; title: string };
function FeaturedPicker({
  kind,
  ids,
  setIds,
  choices,
  max,
}: {
  kind: "Product" | "Collection";
  ids: string[];
  setIds: (ids: string[]) => void;
  choices: Choice[];
  max: number;
}) {
  const title = (id: string) =>
    choices.find((choice) => choice.id === id)?.title ??
    `Unavailable ${kind.toLowerCase()} — remove to save`;
  function move(index: number, offset: number) {
    const next = [...ids];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    setIds(next);
  }
  return (
    <fieldset className="grid gap-3 rounded-lg border p-4">
      <legend>Featured {kind.toLowerCase()}s</legend>
      <p className="text-sm text-muted-foreground">
        Choose up to {max} products, in display order. Only these products
        appear on the homepage. Leave this empty to show the six latest
        published products.
      </p>
      <ol className="grid gap-3">
        {ids.map((id, index) => (
          <li key={id} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name={`featured${kind}Id`} value={id} />
            <span className="min-w-0 flex-1 break-words">
              {index + 1}. {title(id)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === 0}
              aria-label={`Move ${title(id)} up`}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === ids.length - 1}
              aria-label={`Move ${title(id)} down`}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${title(id)}`}
              onClick={() => setIds(ids.filter((item) => item !== id))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <label>
        Add {kind.toLowerCase()}
        <NativeSelect
          aria-label={`Add ${kind.toLowerCase()}`}
          value=""
          disabled={ids.length >= max}
          onChange={(event) => {
            if (event.target.value) setIds([...ids, event.target.value]);
          }}
        >
          <option value="">Choose a published {kind.toLowerCase()}</option>
          {choices
            .filter((choice) => !ids.includes(choice.id))
            .map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title}
              </option>
            ))}
        </NativeSelect>
      </label>
    </fieldset>
  );
}

export function StorefrontSettingsForm({
  hero,
  storeName,
  defaultLocale,
  images,
  products,
}: {
  hero: StorefrontHero;
  storeName: string;
  defaultLocale: string;
  images: { key: string; title: string }[];
  products: Choice[];
}) {
  const [draft, setDraft] = useState<StorefrontHero>(hero);
  const [productIds, setProductIds] = useState(hero?.featuredProductIds ?? []);
  const [locale, setLocale] = useState(defaultLocale === "zh" ? "zh" : "en");
  const [width, setWidth] = useState(1440);
  const [space, setSpace] = useState(0);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSpace(entry!.contentRect.width),
    );
    if (preview.current) observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, space / width);
  return (
    <form
      action={saveStorefrontHero}
      onChange={(event) => {
        const data = new FormData(event.currentTarget);
        const localized = (lang: string) => ({
          heading: String(data.get(`hero-${lang}-heading`) || ""),
          body: String(data.get(`hero-${lang}-body`) || ""),
          imageAlt: String(data.get(`hero-${lang}-imageAlt`) || ""),
        });
        setDraft({
          imageKey: String(data.get("heroImageKey") || "") || null,
          imagePosition: data.get("heroImagePosition") as
            "top" | "center" | "bottom",
          en: localized("en"),
          zh: localized("zh"),
        });
      }}
    >
      <label>
        Hero photograph
        <NativeSelect
          aria-label="Hero photograph"
          name="heroImageKey"
          defaultValue={hero?.imageKey ?? ""}
        >
          <option value="">Text-only introduction</option>
          {images.map((image, index) => (
            <option key={image.key} value={image.key}>
              {image.title} · {index + 1}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label>
        Photograph crop
        <NativeSelect
          aria-label="Photograph crop"
          name="heroImagePosition"
          defaultValue={hero?.imagePosition ?? "center"}
        >
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </NativeSelect>
      </label>
      {(["en", "zh"] as const).map((lang) => (
        <fieldset key={lang} className="grid gap-4 rounded-lg border p-4">
          <legend>{lang === "en" ? "English" : "中文"}</legend>
          <label>
            Headline
            <Input
              name={`hero-${lang}-heading`}
              maxLength={120}
              defaultValue={hero?.[lang]?.heading ?? ""}
            />
          </label>
          <label>
            Introduction
            <Textarea
              name={`hero-${lang}-body`}
              maxLength={300}
              defaultValue={hero?.[lang]?.body ?? ""}
            />
          </label>
          <label>
            Image description
            <Input
              name={`hero-${lang}-imageAlt`}
              maxLength={180}
              defaultValue={hero?.[lang]?.imageAlt ?? ""}
            />
          </label>
        </fieldset>
      ))}
      <FeaturedPicker
        kind="Product"
        ids={productIds}
        setIds={setProductIds}
        choices={products}
        max={6}
      />
      <section
        className="grid min-w-0 gap-3 rounded-lg border p-4"
        aria-label="Homepage preview"
      >
        <h3>Preview before saving</h3>
        <p className="text-sm text-muted-foreground">
          A scaled preview of your unsaved hero and selected product titles.
          Product choices and order are applied when you save.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={width === 1440}
            onClick={() => setWidth(1440)}
          >
            Desktop · 1440px
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={width === 375}
            onClick={() => setWidth(375)}
          >
            Mobile · 375px
          </Button>
          <label>
            Preview language
            <NativeSelect
              aria-label="Preview language"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </NativeSelect>
          </label>
        </div>
        <div
          ref={preview}
          className="relative w-full overflow-hidden rounded-lg border bg-muted"
          style={{ height: space ? Math.ceil(1000 * scale) : 240 }}
        >
          {space > 0 && (
            <iframe
              title="Unsaved homepage preview"
              sandbox=""
              width={width}
              height={1000}
              style={{
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
              srcDoc={storefrontPreviewDocument(
                draft,
                locale,
                defaultLocale,
                storeName,
                productIds.map(
                  (id) => products.find((item) => item.id === id)?.title ?? "",
                ),
              )}
            />
          )}
        </div>
      </section>
      <Button type="submit">Save homepage</Button>
    </form>
  );
}
