import { DomainError } from "@/application/common/errors";
import type { Destination } from "@/domain/financial-projection/discrepancies";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseActionRequiredText(
  value: unknown,
  label: string,
  maxLength = 500,
): string {
  const text = String(value ?? "").trim();
  if (!text) throw new DomainError(`${label} is required.`);
  if (text.length > maxLength)
    throw new DomainError(`${label} must be at most ${maxLength} characters.`);
  return text;
}

export function parseActionInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  const raw = String(value ?? "").trim();
  if (!raw) throw new DomainError(`${label} must be a number.`);
  if (!/^-?\d+$/.test(raw))
    throw new DomainError(`${label} must be an integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed))
    throw new DomainError(`${label} must be a number.`);
  if (parsed < min) throw new DomainError(`${label} must be at least ${min}.`);
  if (parsed > max) throw new DomainError(`${label} must be at most ${max}.`);
  return parsed;
}

export function parseActionEnum<const T extends readonly string[]>(
  value: unknown,
  label: string,
  allowed: T,
): T[number] {
  const text = String(value ?? "").trim();
  if (!(allowed as readonly string[]).includes(text))
    throw new DomainError(`${label} is invalid.`);
  return text as T[number];
}

export function parseActionBoolean(value: unknown, label: string): boolean {
  const text = String(value ?? "").trim();
  if (text === "true") return true;
  if (text === "false") return false;
  throw new DomainError(`${label} must be true or false.`);
}

export function parseActionUuid(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!UUID.test(text)) throw new DomainError(`${label} is invalid.`);
  return text;
}

export function parseActionDestination(
  typeValue: unknown,
  rawValue: unknown,
): Destination {
  const type = parseActionEnum(typeValue, "Destination type", [
    "bank_account",
    "card",
    "cash",
  ] as const);
  const rawDestination = parseActionRequiredText(rawValue, "Destination", 300);
  return { type, rawDestination };
}
