import { textFor } from "@supastore/i18n/messages";

export function customerValidationMessage(
  validity: ValidityState,
  locale: string,
  type: string,
) {
  if (validity.valid) return "";
  const m = textFor(locale).form;
  if (validity.valueMissing)
    return type === "checkbox" ? m.confirm : m.required;
  if (validity.typeMismatch && type === "email") return m.email;
  if (validity.tooShort) return m.tooShort;
  if (validity.tooLong) return m.tooLong;
  return m.invalid;
}
