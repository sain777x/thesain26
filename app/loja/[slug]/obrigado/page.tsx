import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function ObrigadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ produto?: string; status?: string; checkout?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const store = await prisma.store.findFirst({
    where: { slug, published: true },
  });
  if (!store) notFound();

  const failed = query.status === "failed" || query.status === "error";
  const retry = query.checkout
    ? await prisma.product.findFirst({
        where: { id: query.checkout, storeId: store.id, active: true },
        select: { id: true },
      })
    : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
        <p className="text-xs tracking-[0.16em] text-primary uppercase">thesain26</p>
        <h1 className="mt-3 text-5xl">{failed ? "Pagamento não concluído" : "Obrigado"}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {failed
            ? "A Whop não confirmou esta tentativa. Você pode voltar ao checkout e tentar de novo."
            : `${query.produto ? `${query.produto} está a caminho. ` : ""}A confirmação chega pelo webhook da Whop e aparece nas vendas do vendedor.`}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {failed && retry ? (
            <Link
              href={`/checkout/${retry.id}`}
              className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}
            >
              Tentar de novo
            </Link>
          ) : null}
          <Link
            href={`/loja/${store.slug}`}
            className={cn(
              buttonVariants({ size: "lg", variant: failed && retry ? "outline" : "default" }),
              "h-11 px-5",
            )}
          >
            Voltar para {store.name}
          </Link>
        </div>
      </main>
    </>
  );
}
