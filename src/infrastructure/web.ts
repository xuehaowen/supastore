import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/infrastructure/auth";
import { UnauthorizedError } from "@/application/common/errors";
import { hashToken } from "@/application/common/guest-access";
export async function guestIdentity(create = false) {
  const jar = await cookies();
  let raw = jar.get("shop-cart")?.value;
  if (
    raw &&
    (!/^[a-f0-9]{64}\.\d+$/.test(raw) ||
      Number(raw.split(".")[1]) <= Date.now())
  )
    raw = undefined;
  if (!raw && create) {
    raw = randomBytes(32).toString("hex") + "." + (Date.now() + 30 * 86400000);
    jar.set("shop-cart", raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400,
    });
  }
  return raw ? hashToken(raw) : "";
}
export async function staffIdentity() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError("Sign in to continue.");
  return session.user.id;
}
export async function orderToken(id: string) {
  return (await cookies()).get("shop-order-" + id)?.value ?? "";
}
export async function setOrderToken(id: string, token: string) {
  (await cookies()).set("shop-order-" + id, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
}
export function localeOf(value: unknown) {
  return value === "zh" ? "zh" : "en";
}
export function money(amount: number, currency = "USD", precision = 2) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(amount / 10 ** precision);
}
