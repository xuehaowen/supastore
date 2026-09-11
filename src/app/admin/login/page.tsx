import { AuthForm } from "@/app/interactive";
export default function Login() {
  return (
    <main className="narrow standalone">
      <a href="/">← Shop</a>
      <p className="eyebrow">MERCHANT ACCESS</p>
      <h1>Welcome back.</h1>
      <AuthForm />
    </main>
  );
}
