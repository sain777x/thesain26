import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { RegisterForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function CadastroPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "owner" ? "/admin" : "/painel");
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#16382c] p-10 text-[#f6f3ea] lg:flex">
        <Logo inverted href="/" />
        <div>
          <p className="font-heading text-4xl leading-tight">
            Sua loja nasce com uma conta Whop ligada a você.
          </p>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Depois do cadastro você completa o KYC, publica o produto e o
            checkout já cobra a comissão da thesain26.
          </p>
        </div>
        <p className="text-xs text-white/50">thesain26</p>
      </section>
      <section className="flex flex-col justify-center px-6 py-16 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-4xl">Criar minha loja</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Leva um minuto. A connected account é criada em seguida.
          </p>
          <div className="mt-8">
            <RegisterForm />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-foreground underline">
              Entrar
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
