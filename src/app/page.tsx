import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
export const dynamic = "force-dynamic";
export default async function Home() {
  const [settings] = await db.select().from(storeSettings).limit(1);
  redirect(settings?.defaultLocale === "zh" ? "/zh" : "/en");
}
