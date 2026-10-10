import { DomainError } from "@/application/common/errors";
import { redirect } from "next/navigation";
import { ValiError } from "valibot";
export const field = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
export function adminReturnPath(form: FormData) {
  const requested = field(form, "returnTo");
  if (
    /^\/admin\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requested,
    )
  )
    return requested;
  return ["/admin/orders", "/admin/payments", "/admin/fulfillment"].includes(
    requested,
  )
    ? requested
    : "/admin";
}
export async function perform(
  path: string,
  work: () => Promise<string | void>,
): Promise<never> {
  let destination = path;
  try {
    destination = (await work()) || path;
  } catch (error) {
    destination =
      path +
      (path.includes("?") ? "&" : "?") +
      "error=" +
      encodeURIComponent(
        error instanceof DomainError || error instanceof ValiError
          ? error.message
          : "Unable to save. Check your entries and try again.",
      );
  }
  redirect(destination);
}
