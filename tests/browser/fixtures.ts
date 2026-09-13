import { test as base, expect, type Page, type Locator } from "@playwright/test";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
export const test = base.extend<{ sql: ReturnType<typeof postgres>; admin: Page }>({
 sql: async ({}, use) => {
  const url = new URL(process.env.DATABASE_URL ?? "http://missing");
  if (!/^\/supastore_cuj_\d+$/.test(url.pathname) || !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("CUJ fixtures require the isolated test-browser runner.");
  const sql = postgres(url.href); try { await use(sql); } finally { await sql.end(); }
 },
 admin: async ({browser},use) => { const context=await browser.newContext();const page=await context.newPage();await login(page);try {await use(page);}finally{await context.close();} },
});
export { expect };
export async function login(page:Page,email="owner@example.test") {
 await page.goto("/admin/login"); await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);await page.getByRole("button",{name:"Sign in securely",exact:true}).click();await expect(page).toHaveURL(/\/admin(?:\/setup)?$/);
}
export async function freeProduct(sql:ReturnType<typeof postgres>) {
 const handle="free-"+randomUUID();
 const [product]=await sql`insert into products(handle,title,is_published) values(${handle},'Free CUJ product',true) returning id`;
 await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${handle},'Default',0,true)`;
 return handle;
}
export async function checkout(page:Page,sql:ReturnType<typeof postgres>,options:{pickup?:boolean;free?:boolean}={}) {
 const handle=options.free?await freeProduct(sql):"studio-cup";
 await page.goto("/en/products/"+handle);await page.getByRole("button",{name:"Add to bag"}).click();await page.getByRole("link",{name:"Continue to checkout"}).click();
 if(options.pickup) {await page.getByLabel("Local pickup",{exact:true}).check();await page.locator('input[name="pickupLocationId"]').first().check();await page.locator('button.pickup-calendar-day-btn:not([disabled])').first().click();await page.locator('select[name="pickupTime"]').selectOption({index:1});}
 else await page.getByLabel("Street address").fill("1 Test Street");
 if(!options.free || !options.pickup) await page.getByLabel("Payment method").selectOption({label:"Demo bank transfer"});
 await page.getByRole("button",{name:/Review your order/}).click();
 await page.getByLabel("Your name").fill("CUJ Customer");await page.getByLabel("Email address").fill("cuj@example.test");await page.getByRole("checkbox").check();await page.getByRole("button",{name:/Accept total & place order/}).click();await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
 const id=new URL(page.url()).pathname.split("/").pop()!;
 const [order]=await sql`select id,reference_code,purchase_total_cents,lifecycle_status from orders where id=${id}`;
 return order! as {id:string;reference_code:string;purchase_total_cents:number;lifecycle_status:string};
}
export async function openOrder(admin:Page,reference:string) { await admin.goto("/admin");const row=admin.locator("details").filter({has:admin.locator("summary",{hasText:reference})});await expect(row).toHaveCount(1);await row.locator("summary").click();return row; }
export async function submit(form:Locator,name:string) {await clickAction(form.page(),form.getByRole("button",{name,exact:true}));}
export async function record(admin:Page,reference:string,amount:number,bankReference=randomUUID()) {
 const row=await openOrder(admin,reference);const form=row.locator("form").filter({has:admin.getByRole("button",{name:"Record receipt",exact:true})});
 await form.getByLabel("Received amount (minor units)").fill(String(amount));await form.getByLabel("Actual bank / cash reference").fill(bankReference);await form.getByRole("checkbox").check();await submit(form,"Record receipt");await expect(admin).toHaveURL(/\/admin$/);
}
export async function confirm(admin:Page,reference:string){const row=await openOrder(admin,reference);await submit(row,"Confirm exact payment");await expect(admin).toHaveURL(/\/admin$/);}

export async function clickAction(page:Page, button:Locator) {
 const response=page.waitForResponse(response=>response.request().method()==="POST" && new URL(response.url()).origin===new URL(page.url()).origin);
 const hasDetails = await button.locator("xpath=ancestor::details").count();
 await button.click();await response;
 if(hasDetails) await expect(page.locator("details[open]")).toHaveCount(0);
}

