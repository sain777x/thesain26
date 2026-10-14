import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  if (session?.user) {
    redirect(session.user.role === "owner" ? "/admin" : "/painel");
  }
  const next =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/painel";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#16382c] p-10 text-[#f6f3ea] lg:flex">
        <Logo inverted href="/" />
        <div>
          <p className="font-heading text-4xl leading-tight">
            Entre para cuidar da loja, do KYC e dos saques.
          </p>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            O dono da thesain26 usa o mesmo login. A comissão de cada venda já
            chega pela Whop.
          </p>
        </div>
        <p className="text-xs text-white/50">thesain26</p>
      </section>
      <section className="flex flex-col justify-center px-6 py-16 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-4xl">Entrar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Email e senha da sua conta na thesain26.
          </p>
          <div className="mt-8">
            <LoginForm callbackUrl={next} />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Ainda não vende aqui?{" "}
            <Link href="/cadastro" className="text-foreground underline">
              Criar minha loja
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
