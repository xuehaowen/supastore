import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("owners order siblings while storefront categories stay grouped across languages", async ({
  admin,
  page,
  sql,
}) => {
  const token = `nav-${randomUUID()}`;
  const ids: string[] = [];
  async function create(
    key: string,
    name: string,
    position: number,
    parentId: string | null = null,
  ) {
    const [row] =
      await sql`insert into categories(slug,name,sort_order,parent_id) values(${`${token}-${key}`},${name},${position},${parentId}) returning id`;
    ids.push(row!.id);
    await sql`insert into category_translations(category_id,locale,name) values(${row!.id},'zh',${`中文 ${name}`})`;
    return row!.id as string;
  }
  try {
    const a = await create("a", "Navigation parent A", 20);
    await create("b", "Navigation parent B", 10);
    const childA = await create("child-a", "Navigation child A", 20, a);
    const childB = await create("child-b", "Navigation child B", 10, a);
    await create("grandchild", "Navigation grandchild", 0, childB);
    await admin.goto(`/admin/categories?q=${token}`);
    await admin
      .getByRole("spinbutton", {
        name: "Storefront order · Navigation parent A",
        exact: true,
      })
      .fill("0");
    await clickAction(
      admin,
      admin.getByRole("button", {
        name: "Save order · Navigation parent A",
        exact: true,
      }),
    );
    expect(new URL(admin.url()).searchParams.get("q")).toBe(token);
    await admin
      .getByRole("spinbutton", {
        name: "Storefront order · Navigation child A",
        exact: true,
      })
      .fill("0");
    await clickAction(
      admin,
      admin.getByRole("button", {
        name: "Save order · Navigation child A",
        exact: true,
      }),
    );
    for (const locale of ["en", "zh"]) {
      await page.goto(`/${locale}/search?q=${token}`);
      await page.setViewportSize({ width: 1280, height: 900 });
      const nav = page.locator('.catalog-desktop-filters [name="category"]');
      const order = await nav
        .locator("option")
        .evaluateAll(
          (options, prefix) =>
            options
              .map((option) => (option as HTMLOptionElement).value)
              .filter((value) => value.startsWith(prefix)),
          token,
        );
      expect(order).toEqual(
        ["a", "child-a", "child-b", "grandchild", "b"].map(
          (key) => `${token}-${key}`,
        ),
      );
      const child = nav.locator("option").filter({
        hasText:
          locale === "en" ? "Navigation child A" : "中文 Navigation child A",
      });
      await expect(child).toHaveText(
        new RegExp(
          "— " +
            (locale === "en"
              ? "Navigation child A"
              : "中文 Navigation child A"),
        ),
      );
      await page.setViewportSize({ width: 375, height: 812 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (await sql`select sort_order from categories where id=${childA}`)[0]!
        .sort_order,
    ).toBe(0);
  } finally {
    for (const id of ids.reverse())
      await sql`delete from categories where id=${id}`;
  }
});

test("collection positions persist, featured choices stay separate, and all published collections remain reachable", async ({
  admin,
  page,
  sql,
}) => {
  const token = `nav-${randomUUID()}`;
  const items: { id: string; handle: string; title: string }[] = [];
  const [saved] = await sql`select storefront_hero from store_settings`;
  try {
    for (let i = 1; i <= 27; i++) {
      const handle = `${token}-${String(i).padStart(2, "0")}`;
      const title = `Navigation collection ${i}`;
      const [row] =
        await sql`insert into product_collections(handle,title,is_published,sort_order) values(${handle},${title},true,${100 + i}) returning id`;
      items.push({ id: row!.id, handle, title });
      await sql`insert into collection_translations(collection_id,locale,title,description) values(${row!.id},'zh',${`中文系列 ${28 - i}`},'')`;
    }
    await sql`insert into product_collections(handle,title,is_published,sort_order) values(${`${token}-draft`},'Hidden navigation draft',false,0)`;
    await sql`update store_settings set storefront_hero=${sql.json({ ...(saved!.storefront_hero ?? {}), featuredCollectionIds: [items[1]!.id, items[0]!.id] })}`;
    const [product] =
      await sql`select id from products where handle='studio-cup'`;
    for (const item of items.slice(0, 2))
      await sql`insert into product_collection_memberships(collection_id,product_id) values(${item.id},${product!.id})`;
    const last = items.at(-1)!;
    await admin.goto(`/admin/collections?q=${encodeURIComponent(last.title)}`);
    await admin
      .getByRole("spinbutton", {
        name: `Storefront order · ${last.title}`,
        exact: true,
      })
      .fill("0");
    await clickAction(
      admin,
      admin.getByRole("button", {
        name: `Save order · ${last.title}`,
        exact: true,
      }),
    );
    await admin.reload();
    await expect(
      admin.getByRole("spinbutton", {
        name: `Storefront order · ${last.title}`,
        exact: true,
      }),
    ).toHaveValue("0");
    await page.goto("/en");
    await page
      .getByRole("link", { name: "Shop all products", exact: false })
      .click();
    await page.getByRole("link", { name: "View all collections" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Collections",
    );
    const expected = [
      last.handle,
      ...items.slice(0, -1).map((item) => item.handle),
    ];
    for (const locale of ["en", "zh"]) {
      const seen: string[] = [];
      for (const position of [1, 2]) {
        await page.goto(`/${locale}/collections?page=${position}`);
        seen.push(
          ...(await page
            .locator(".collection-directory-grid a")
            .evaluateAll(
              (links, prefix) =>
                links
                  .map((link) =>
                    new URL((link as HTMLAnchorElement).href).pathname
                      .split("/")
                      .pop()!,
                  )
                  .filter((value) => value.startsWith(prefix)),
              token,
            )),
        );
        await expect(
          page.getByText("Hidden navigation draft", { exact: true }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      expect(seen).toEqual(expected);
    }
  } finally {
    await sql`update store_settings set storefront_hero=${saved!.storefront_hero === null ? null : sql.json(saved!.storefront_hero)}`;
    await sql`delete from product_collections where handle like ${token + "%"}`;
  }
});
