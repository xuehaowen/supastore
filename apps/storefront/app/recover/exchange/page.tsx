import { textFor } from "@supastore/i18n/messages";
import { DocumentLanguage } from "../../../../../packages/i18n/src/document-language";
import { exchangeLink } from "../../actions";
import { localeOf } from "../../../lib/web";
import { Hidden } from "../../components";
import { Button } from "@supastore/ui/button";
import { Card, CardContent } from "@supastore/ui/card";
export const metadata = { robots: { index: false, follow: false } };
export default async function Exchange({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; locale?: string }>;
}) {
  const { token, locale: requestedLocale } = await searchParams;
  const locale = localeOf(requestedLocale);
  return (
    <main className="mx-auto my-12 min-h-[50vh] max-w-xl">
      <DocumentLanguage locale={locale} />
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {textFor(locale).common.openOrder}
      </h1>
      <p>{textFor(locale).common.exchangeNotice}</p>
      <Card>
        <CardContent>
          <form className="grid gap-4" action={exchangeLink}>
            <Hidden name="token" value={token ?? ""} />
            <Hidden name="locale" value={locale} />
            <Button type="submit">
              {textFor(locale).common.continueToOrder}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
