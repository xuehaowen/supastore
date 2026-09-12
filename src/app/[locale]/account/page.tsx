import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/infrastructure/auth";
import { AuthForm, SessionVerificationGuard, SignOutButton } from "@/app/interactive";
import { Card, CardContent } from "@/components/ui/card";

export default async function Account({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rawSession = await auth.api.getSession({ headers: await headers() });
  const session = rawSession?.user.emailVerified ? rawSession : null;

  return (
    <section className="account-shell">
      <div className="account-heading">
        <p className="eyebrow">YOUR SUPASTORE</p>
        <h1>{session ? "Good to see you." : "A calmer way to check out."}</h1>
        <p>{session ? "Your account is signed in on this device." : "Save a verified account for a smoother return to the store."}</p>
      </div>
      <Card className="account-card auth-card">
        <CardContent>
          {session ? (
            <div className="grid gap-5">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">SIGNED IN AS</p>
                <p className="mt-2 font-medium">{session.user.name || "Customer"}</p>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">Orders placed as a guest remain private to their order link. You can always find one from the recovery page.</p>
              <div className="flex flex-wrap gap-3">
                <SignOutButton locale={locale} />
                <Link className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted" href="/recover">Find an order</Link>
              </div>
            </div>
          ) : (
            <>
              {rawSession && <SessionVerificationGuard />}
            <AuthForm audience="customer" locale={locale} />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
