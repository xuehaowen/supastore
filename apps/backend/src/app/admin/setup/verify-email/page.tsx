import { verifyEmail } from "@/app/actions";
import { Button } from "@supastore/ui/button";
import { Hidden } from "@/app/components";
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <main className="mx-auto my-12 min-h-[50vh] max-w-xl">
      <h1>Verify email delivery</h1>
      <form className="grid gap-4" action={verifyEmail}>
        <Hidden name="token" value={(await searchParams).token ?? ""} />
        <Button type="submit">Confirm email delivery</Button>
      </form>
    </main>
  );
}
