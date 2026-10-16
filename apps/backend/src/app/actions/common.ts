import { describeFailure } from "@/infrastructure/http/failure";
import { redirect } from "next/navigation";
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
    const failure = describeFailure(
      error,
      "admin.action",
      "Unable to save. Please retry.",
    );
    const [base, fragment] = path.split("#", 2);
    destination =
      base +
      (base!.includes("?") ? "&" : "?") +
      "error=" +
      encodeURIComponent(
        failure.message +
          (failure.status >= 500 ? ` Reference: ${failure.requestId}` : ""),
      ) +
      (failure.status >= 500 ? `&requestId=${failure.requestId}` : "") +
      (fragment ? `#${fragment}` : "");
  }
  redirect(destination);
}
