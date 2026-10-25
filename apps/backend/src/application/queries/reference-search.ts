import { ilike, type AnyColumn } from "drizzle-orm";
import { normalizeDisplayReference } from "@/domain/money/display-reference";

export function referenceSearch(column: AnyColumn, query: string) {
  const reference = normalizeDisplayReference(query).replace(/[\\%_]/g, "\\$&");
  return ilike(column, `%${reference}%`);
}
