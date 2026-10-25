export { money } from "./money";
export function localeOf(value: unknown) {
  return value === "zh" ? "zh" : "en";
}
