import { verifyEmail } from "@/app/actions";
import { Button } from "@supastore/ui/button";
import { Hidden } from "@/app/components";
import Link from "next/link";
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <main
      id="admin-content"
      tabIndex={-1}
      className="panel admin-state mx-auto my-12 min-h-[50vh] max-w-xl"
    >
      <h1>Verify email delivery</h1>
      <p>
        Confirm that the owner inbox received this store verification message.
      </p>
      <form className="grid gap-4" action={verifyEmail}>
        <Hidden name="token" value={(await searchParams).token ?? ""} />
        <Button type="submit">Confirm email delivery</Button>
      </form>
      <Link href="/admin/setup">Back to store settings</Link>
    </main>
  );
}
