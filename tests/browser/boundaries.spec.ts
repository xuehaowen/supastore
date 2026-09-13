import AxeBuilder from "@axe-core/playwright";
import { test, expect, checkout, openOrder, clickAction, record } from "./fixtures";

async function accessible(page: import("@playwright/test").Page) {
 const scan=await new AxeBuilder({page}).analyze();
 expect(scan.violations.filter(v=>["critical","serious"].includes(v.impact??""))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test("C3 unsupported destination preserves cart and explains next action",async({page})=>{
 await page.goto("/en/products/studio-cup");await page.getByRole("button",{name:"Add to bag"}).click();await page.getByRole("link",{name:"Continue to checkout"}).click();
 await page.locator('[name="country"]').evaluate(el=>{const select=el as HTMLSelectElement;select.add(new Option("Unsupported","ZZ"));});await page.locator('[name="country"]').selectOption("ZZ");await page.getByLabel("Street address").fill("1 Test Street");await page.getByLabel("Payment method").selectOption({label:"Demo bank transfer"});
 await clickAction(page,page.getByRole("button",{name:/Review your order/}));await expect(page.locator('[data-slot="alert"]')).toContainText(/ship|destination|country/i);await page.goto("/en/cart");await expect(page.getByText("Studio cup",{exact:true})).toBeVisible();
});

test("C3/C4 keyboard checkout and expanded admin forms are accessible on mobile",async({page,admin,sql})=>{
 await page.setViewportSize({width:360,height:780});await admin.setViewportSize({width:360,height:780});
 await page.goto("/en/products/studio-cup");await page.getByRole("button",{name:"Add to bag"}).focus();await page.keyboard.press("Enter");await page.getByRole("link",{name:"Continue to checkout"}).click();await page.getByLabel("Street address").fill("1 Test Street");await page.getByLabel("Payment method").selectOption({label:"Demo bank transfer"});await accessible(page);await page.getByRole("button",{name:/Review your order/}).focus();await page.keyboard.press("Enter");await page.getByLabel("Your name").fill("Keyboard Customer");await page.getByLabel("Email address").fill("keyboard@example.test");await page.getByRole("checkbox").focus();await page.keyboard.press("Space");await expect(page.getByRole("checkbox")).toBeChecked();await accessible(page);await page.getByRole("button",{name:/Accept total & place order/}).focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/\/orders\//);
 const reference=await page.locator("h1").innerText();await openOrder(admin,reference);await accessible(admin);
 await record(admin,reference,2900);await admin.goto("/admin");const row=admin.locator("#ready details").filter({has:admin.locator("summary",{hasText:reference})});await row.locator("summary").click();await accessible(admin);
 await admin.goto("/admin/setup");await accessible(admin);
});

test("A7 late receipt on a cancelled order creates return work without reopening",async({page,admin,sql})=>{
 const order=await checkout(page,sql);const row=await openOrder(admin,order.reference_code);await row.getByLabel("Cancellation reason").fill("Cancelled before payment");await clickAction(admin,row.getByRole("button",{name:"Cancel order",exact:true}));
 await record(admin,order.reference_code,100);
 expect((await sql`select lifecycle_status from orders where id=${order.id}`)[0]!.lifecycle_status).toBe("cancelled");
 const returns=await sql`select amount_cents from payment_returns where order_id=${order.id} and kind='late_return'`;
 expect(returns).toHaveLength(1);expect(returns[0]!.amount_cents).toBe(100);
 await page.reload();await expect(page.getByText(/cancelled/).first()).toBeVisible();
});
