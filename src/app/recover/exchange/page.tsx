import { exchangeLink } from "@/app/actions";
import { Hidden } from "@/app/components";
export default async function Exchange({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="narrow standalone">
      <h1>Open your order</h1>
      <p>This link can be used once. Continue to securely open your order.</p>
      <form action={exchangeLink}>
        <Hidden name="token" value={token ?? ""} />
        <button>Continue to order</button>
      </form>
    </main>
  );
}
