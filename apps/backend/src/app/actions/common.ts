import { DomainError } from "@/application/common/errors";
import { redirect } from "next/navigation";
import { ValiError } from "valibot";
import { adminReturnContext } from "@/application/common/admin-return-context";
export const field = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
export function adminReturnPath(form: FormData) {
  return adminReturnContext(field(form, "returnTo"));
}
export async function perform(
  path: string,
  work: () => Promise<string | void>,
): Promise<never> {
  let destination = path;
  try {
    destination = (await work()) || path;
  } catch (error) {
    const [base, fragment] = path.split("#", 2);
    destination =
      base +
      (base!.includes("?") ? "&" : "?") +
      "error=" +
      encodeURIComponent(
        error instanceof DomainError || error instanceof ValiError
          ? error.message
          : "Unable to save. Check your entries and try again.",
      ) +
      (fragment ? `#${fragment}` : "");
  }
  redirect(destination);
}
