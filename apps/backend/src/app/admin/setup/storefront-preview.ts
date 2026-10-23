import {
  localizedStorefrontHero,
  type StorefrontHero,
} from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

/** A script-free, sandboxed draft. Escape merchant text before inserting HTML. */
export function storefrontPreviewDocument(
  hero: StorefrontHero,
  locale: string,
  defaultLocale: string,
  storeName: string,
  collectionTitles: string[],
) {
  const copy = textFor(locale).design;
  const content = localizedStorefrontHero(hero, locale, defaultLocale);
  return `<!doctype html><html lang="${locale === "zh" ? "zh" : "en"}"><head><meta charset="utf-8"><title>${escape(storeName)} · ${escape(copy.shop)}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;background:#faf9f3;color:#0a3022;font-family:"Segoe UI",Arial,sans-serif}main{max-width:1440px;padding:0 64px;margin:auto}header{padding:28px 0;border-bottom:1px solid #d8d9cf;font:32px Georgia,serif}.hero{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;padding:56px 0;border-bottom:1px solid #d8d9cf}.copy{max-width:608px}.eyebrow{font-size:11px;letter-spacing:.1em}h1{font:clamp(40px,5.6vw,76px)/1.08 Georgia,serif;letter-spacing:-.05em;text-wrap:balance;overflow-wrap:anywhere;margin:24px 0}p{line-height:1.8;max-width:44ch;overflow-wrap:anywhere}.body{color:#5e655c}.cta{display:inline-block;margin-top:24px;padding-bottom:12px;border-bottom:1px solid;font-size:14px}img{display:block;width:100%;height:100%;object-fit:cover;object-position:${hero?.imagePosition === "top" ? "center top" : hero?.imagePosition === "bottom" ? "center bottom" : "center"};border-radius:12px}.photo{aspect-ratio:7/6;overflow:hidden}.collections{display:flex;gap:24px;flex-wrap:wrap;padding:32px 0}.collections span{padding:16px 0;border-bottom:1px solid #d8d9cf}.text-only{grid-template-columns:1fr}@media(max-width:767px){main{padding:0 20px}header{font-size:30px;padding:24px 0}.hero{grid-template-columns:1fr;padding:32px 0;gap:32px}.photo{aspect-ratio:7/6}}@media(min-width:768px) and (max-width:1023px){main{padding:0 32px}}
  </style></head><body><main><header>${escape(storeName)}</header><section class="hero ${content?.imageKey ? "" : "text-only"}"><div class="copy"><p class="eyebrow">${escape(copy.edit)}</p><h1>${escape(content?.heading || storeName)}</h1><p class="body">${escape(content?.body || "")}</p><span class="cta">${escape(copy.browse)} ↓</span></div>${content?.imageKey ? `<div class="photo"><img src="/api/assets?key=${encodeURIComponent(content.imageKey)}&amp;inline=1" alt="${escape(content.imageAlt || content.heading || storeName)}"></div>` : ""}</section><nav class="collections">${collectionTitles.map((title) => `<span>${escape(title)}</span>`).join("")}</nav></main></body></html>`;
}
