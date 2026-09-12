import { exchangeLink } from "@/app/actions";
import { Hidden } from "@/app/components";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export default async function Exchange({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto my-12 min-h-[50vh] max-w-xl">
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">Open your order</h1>
      <p>This link can be used once. Continue to securely open your order.</p>
      <Card><CardContent><form className="grid gap-4" action={exchangeLink}>
        <Hidden name="token" value={token ?? ""} />
        <Button type="submit">Continue to order</Button>
      </form></CardContent></Card>
    </main>
  );
}
