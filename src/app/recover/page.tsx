import Link from "next/link";
import { recoverOrder } from "@/app/actions";
import { Field, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export const metadata = { robots: { index: false, follow: false } };
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const q = await searchParams;
  return (
    <main className="mx-auto my-12 min-h-[50vh] max-w-xl">
      <Link href="/">← Shop</Link>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        Find your order
      </h1>
      <Notice error={q.error} />
      {q.sent ? (
        <p role="status">
          If an order was found, a recovery link has been sent.
        </p>
      ) : (
        <p>Enter the email and payment reference used for your order.</p>
      )}
      <Card>
        <CardContent>
          <form className="grid gap-4" action={recoverOrder}>
            <Field name="email" label="Email" type="email" />
            <Field name="reference" label="Payment reference" />
            <Button type="submit">Send recovery link</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
