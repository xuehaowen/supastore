import { textFor } from "@/i18n/messages";
import { DocumentLanguage } from "../../../packages/i18n/src/document-language";
import Link from "next/link";
import { recoverOrder } from "@/app/actions";
import { Field, Notice, Hidden } from "@/app/components";
import { localeOf } from "@/infrastructure/web";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export const metadata = { robots: { index: false, follow: false } };
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; locale?: string }>;
}) {
  const q = await searchParams;
  const locale = localeOf(q.locale);
  return (
    <main className="mx-auto my-12 min-h-[50vh] max-w-xl">
      <DocumentLanguage locale={locale} />
      <Link href={`/${locale}`}>← {textFor(locale).shop}</Link>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {textFor(locale).common.recoveryTitle}
      </h1>
      <Notice error={q.error} locale={locale} />
      {q.sent ? (
        <p role="status">{textFor(locale).common.recoverySent}</p>
      ) : (
        <p>{textFor(locale).common.recoveryInstructions}</p>
      )}
      <Card>
        <CardContent>
          <form className="grid gap-4" action={recoverOrder}>
            <Hidden name="locale" value={locale} />
            <Field
              name="email"
              label={textFor(locale).auth.email}
              type="email"
            />
            <Field
              name="reference"
              label={textFor(locale).common.paymentReference}
            />
            <Button type="submit">{textFor(locale).common.sendRecovery}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
