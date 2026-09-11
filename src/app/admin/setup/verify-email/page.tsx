import { verifyEmail } from "@/app/actions";
import { Hidden } from "@/app/components";
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <main className="narrow standalone">
      <h1>Verify email delivery</h1>
      <form action={verifyEmail}>
        <Hidden name="token" value={(await searchParams).token ?? ""} />
        <button>Confirm email delivery</button>
      </form>
    </main>
  );
}
