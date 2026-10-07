import { CustomerAuthTools } from "@/app/customer-auth";
export const metadata = { robots: { index: false, follow: false } };
export default async function ResetPassword({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  return (
    <section className="account-shell">
      <h1>{locale === "zh" ? "重置密码" : "Reset password"}</h1>
      <CustomerAuthTools
        locale={locale}
        reset
        {...(query.token ? { token: query.token } : {})}
        invalidToken={Boolean(query.error)}
      />
    </section>
  );
}
