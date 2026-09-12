import { AuthForm } from "@/app/interactive";
import { Card, CardContent } from "@/components/ui/card";
export default function Login() {
  return (
    <main className="mx-auto my-12 min-h-[50vh] max-w-xl">
      <a href="/">← Shop</a>
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">MERCHANT ACCESS</p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">Welcome back.</h1>
      <Card><CardContent><AuthForm /></CardContent></Card>
    </main>
  );
}
