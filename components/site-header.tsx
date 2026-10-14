import Link from "next/link";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { signOutAction } from "@/lib/actions";
import { cn } from "cn";

export async function SiteHeader() {
  const session = await auth();
  const role = session?.user?.role;
  const home = role === "owner" ? "/admin" : "/painel";

  return (
    <header className="border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {session?.user ? (
            <>
              <Link
                href={home}
                className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
              >
                {role === "owner" ? "Plataforma" : "Minha loja"}
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
                >
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
              >
                <span className="sm:hidden">Criar loja</span>
                <span className="hidden sm:inline">Criar minha loja</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
