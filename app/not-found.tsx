import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-start justify-center px-6">
      <Logo />
      <h1 className="mt-8 text-4xl">Essa página não está na thesain26.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        A loja pode ter sido despublicada ou o endereço mudou.
      </p>
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-10 px-4")}>
        Ir para o início
      </Link>
    </main>
  );
}
