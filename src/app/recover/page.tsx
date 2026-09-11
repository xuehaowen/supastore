import { recoverOrder } from "@/app/actions";
import { Field, Notice } from "@/app/components";
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const q = await searchParams;
  return (
    <main className="narrow standalone">
      <a href="/">← Shop</a>
      <h1>Find your order</h1>
      <Notice error={q.error} />
      {q.sent ? (
        <p role="status">
          If an order was found, a recovery link has been sent.
        </p>
      ) : (
        <p>Enter the email and payment reference used for your order.</p>
      )}
      <form action={recoverOrder}>
        <Field name="email" label="Email" type="email" />
        <Field name="reference" label="Payment reference" />
        <button>Send recovery link</button>
      </form>
    </main>
  );
}
