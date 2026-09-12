import { AuthForm } from "@/app/interactive";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "staff"
      ? "This account is signed in, but it does not have staff access. Use an approved merchant account instead."
      : error === "sign-in"
        ? "Sign in with your staff account to open the merchant workspace."
        : null;
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <a href="/" className="auth-brand">SupaStore</a>
        <div>
          <p className="eyebrow">MERCHANT WORKSPACE</p>
          <h1>Run the store<br />with clarity.</h1>
          <p>Review orders, manage availability, and keep every customer promise on track.</p>
        </div>
      </section>
      <section className="auth-panel">
        <a href="/" className="text-sm text-muted-foreground">← Back to storefront</a>
        <div>
          <p className="eyebrow">STAFF SIGN IN</p>
          <h2>Welcome back.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Use your verified staff account. Customer accounts cannot access store operations.</p>
        </div>
        {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
        <Card className="auth-card"><CardContent><AuthForm /></CardContent></Card>
      </section>
    </main>
  );
}
