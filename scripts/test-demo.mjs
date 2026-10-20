import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeDemoSettings } from "./demo-settings.mjs";

const directory = fileURLToPath(
  new URL("../.supastore-demo/", import.meta.url),
);
if (!existsSync(new URL("../.supastore-demo/settings.env", import.meta.url)))
  throw new Error("Start the isolated demo with node scripts/demo.mjs first.");
const { settings } = initializeDemoSettings(directory);
const origin = `http://localhost:${settings.DEMO_PORT}`;
const cookies = new Map();
async function request(path, body) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return response;
}

assert.equal((await request("/api/health/ready")).status, 200);
const home = await request("/en");
assert.equal(home.status, 200);
const html = await home.text();
for (const title of ["Market tote", "Studio cup", "Everyday shirt"])
  assert.ok(html.includes(title), `Missing seeded product: ${title}`);
const catalog = await request("/api/v1/catalog");
assert.equal(catalog.status, 200);
const handles = (await catalog.json()).data.items.map((item) => item.handle);
for (const handle of ["market-tote", "studio-cup", "everyday-shirt"])
  assert.ok(handles.includes(handle), `Missing catalog entry: ${handle}`);
const anonymous = await request("/admin");
assert.ok([302, 303, 307, 308].includes(anonymous.status));
assert.match(anonymous.headers.get("location") ?? "", /\/admin\/login/);

try {
  const login = await request("/api/admin-auth/sign-in/email", {
    email: "owner@example.test",
    password: "DemoStorePassword123!",
  });
  assert.equal(login.status, 200, "Synthetic owner sign-in must succeed");
  const session = await request("/api/admin-auth/get-session");
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, "owner@example.test");
  const admin = await request("/admin");
  assert.equal(admin.status, 200, "Owner must have staff access");
  assert.ok((await admin.text()).includes("Commerce overview"));
} finally {
  const logout = await request("/api/admin-auth/sign-out", {});
  assert.equal(logout.status, 200);
}
assert.equal(await (await request("/api/admin-auth/get-session")).json(), null);
console.log(
  "Demo smoke passed: readiness, seeded catalog, owner access and sign-out.",
);
