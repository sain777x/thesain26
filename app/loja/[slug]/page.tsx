import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { checkoutPath } from "@/lib/checkout-link";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function LojaPublicaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await prisma.store.findFirst({
    where: { slug, published: true },
    include: {
      user: { select: { name: true, kycStatus: true } },
      products: { where: { active: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!store) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <header
          className="px-4 py-14 text-white sm:px-6"
          style={{ backgroundColor: store.primaryColor }}
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs tracking-[0.16em] uppercase text-white/70">
                thesain26
              </p>
              <h1 className="mt-2 text-5xl">{store.name}</h1>
              <p className="mt-3 max-w-xl text-sm text-white/80">
                {store.description || `Loja de ${store.user.name}.`}
              </p>
            </div>
            {store.user.kycStatus === "verified" ? (
              <Badge className="bg-white text-[#16382c]">Vendedor verificado</Badge>
            ) : null}
          </div>
        </header>
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          {store.products.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
              <p className="font-heading text-2xl">Esta loja ainda não publicou produtos.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {store.products.map((product) => (
                <Link
                  key={product.id}
                  href={checkoutPath(product.id)}
                  className="flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10"
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div
                      className="grid aspect-[4/3] place-items-center text-sm text-white/80"
                      style={{ backgroundColor: store.accentColor }}
                    >
                      Produto digital
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-4 p-4">
                    <div className="space-y-2">
                      <h2 className="text-2xl">{product.name}</h2>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {product.description || "Entrega digital depois do pagamento."}
                      </p>
                      <p className="text-sm font-medium">
                        {formatMoney(product.price, product.currency)}
                      </p>
                    </div>
                    <span className={cn(buttonVariants({ size: "lg" }), "mt-auto h-10 w-full")}>
                      Comprar
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
