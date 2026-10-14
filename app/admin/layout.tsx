import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { signOutAction } from "@/lib/actions";
import { requireOwner } from "@/lib/guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireOwner();
  } catch {
    redirect("/painel");
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted-foreground">Dono da plataforma</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Site
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-muted-foreground hover:text-foreground">
              Sair
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
