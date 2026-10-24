import { textFor } from "@supastore/i18n/messages";
import { DocumentLanguage } from "../../../../packages/i18n/src/document-language";
import Link from "next/link";
import { recoverOrder } from "../actions";
import { Notice, Hidden } from "../components";
import { CustomerField as Field } from "../customer-field";
import { CustomerForm } from "../customer-form";
import { CustomerSubmit as Button } from "../customer-submit";
import { localeOf } from "../../lib/web";
import { Card, CardContent } from "@supastore/ui/card";
export const metadata = { robots: { index: false, follow: false } };
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{
    requestId?: string;
    error?: string;
    sent?: string;
    locale?: string;
  }>;
}) {
  const q = await searchParams;
  const locale = localeOf(q.locale);
  return (
    <main className="storefront-state storefront-shell">
      <DocumentLanguage locale={locale} />
      <Link href={`/${locale}`}>← {textFor(locale).shop}</Link>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {textFor(locale).common.recoveryTitle}
      </h1>
      <Notice error={q.error} locale={locale} requestId={q.requestId} />
      {q.sent ? (
        <p role="status">{textFor(locale).common.recoverySent}</p>
      ) : (
        <p>{textFor(locale).common.recoveryInstructions}</p>
      )}
      <Card>
        <CardContent>
          <CustomerForm
            locale={locale}
            className="grid gap-4"
            action={recoverOrder}
          >
            <Hidden name="locale" value={locale} />
            <Field
              name="email"
              label={textFor(locale).auth.email}
              type="email"
              autoComplete="email"
            />
            <Field
              name="reference"
              label={textFor(locale).common.paymentReference}
            />
            <Button locale={locale}>
              {textFor(locale).common.sendRecovery}
            </Button>
          </CustomerForm>
        </CardContent>
      </Card>
    </main>
  );
}
