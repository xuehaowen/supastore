import { redirect } from "next/navigation";
import { readPage } from "../lib/page-data";
export default async function Home() {
  const { store } = await readPage("layout", "en");
  redirect(store?.defaultLocale === "zh" ? "/zh" : "/en");
}
