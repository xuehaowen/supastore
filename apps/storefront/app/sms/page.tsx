import { redirect } from "next/navigation";
import { readPage } from "../../lib/page-data";
export default async function Sms() {
  const { store } = await readPage("layout", "en");
  redirect(`/${store?.defaultLocale === "zh" ? "zh" : "en"}/sms`);
}
