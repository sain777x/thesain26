import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SellerNav } from "@/components/seller-nav";
import { requireSeller } from "@/lib/guards";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireSeller();
  } catch {
    redirect("/login?callbackUrl=/painel");
  }
  if (user.role === "owner" && !user.store) redirect("/admin");

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-6 print:hidden lg:sticky lg:top-6 lg:self-start">
        <Logo />
        <SellerNav storeSlug={user.store?.published ? user.store.slug : null} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
