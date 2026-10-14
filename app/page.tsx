import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, stores] = await Promise.all([
    getPlatformSettings(),
    prisma.store.findMany({
      where: { published: true, products: { some: { active: true } } },
      include: {
        user: { select: { name: true, kycStatus: true } },
        products: {
          where: { active: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { products: { where: { active: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const samplePrice = 20;
  const sampleFee = Math.round(samplePrice * (settings.feePercent / 100) * 100) / 100;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <p className="text-sm font-medium tracking-wide text-primary uppercase">
              Marketplace de produtos digitais
            </p>
            <h1 className="mt-3 max-w-xl text-5xl leading-[1.05] text-balance sm:text-6xl">
              Venda na thesain26. O pagamento fica na Whop.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Vendedores abrem a própria loja, completam a verificação e os
              saques pelos fluxos oficiais da Whop, e vendem com checkout
              embutido. Cada cobrança é direta na conta do vendedor. A
              thesain26 recebe a comissão automática de {settings.feePercent}%
              em application fee.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/cadastro"
                className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}
              >
                Criar minha loja
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "h-11 px-5",
                )}
              >
                Já tenho conta
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-[#16382c] p-6 text-[#f6f3ea] shadow-xl sm:p-8">
            <p className="text-xs tracking-[0.18em] uppercase text-[#d7c7a1]">
              Como a comissão entra
            </p>
            <p className="mt-4 font-heading text-3xl">Direct charge</p>
            <dl className="mt-8 space-y-4 text-sm">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <dt>Produto digital</dt>
                <dd>{formatMoney(samplePrice)}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <dt>Comissão thesain26 ({settings.feePercent}%)</dt>
                <dd>{formatMoney(sampleFee)}</dd>
              </div>
              <div className="flex items-center justify-between text-base">
                <dt>Vendedor recebe</dt>
                <dd className="font-heading text-2xl">
                  {formatMoney(samplePrice - sampleFee)}
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-xs leading-relaxed text-white/70">
              A Whop cria a cobrança na connected account do vendedor. Taxas,
              reembolsos e disputas ficam com ele. A plataforma só coleta o
              application fee.
            </p>
          </div>
        </section>

        <section className="border-y bg-card">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Abra a loja",
                body: "Cadastro com email e senha. A thesain26 cria a connected account na Whop e guarda o biz_id no seu usuário.",
              },
              {
                step: "02",
                title: "Verifique e saque",
                body: "O KYC abre num Account Link oficial (account_onboarding). O saldo e os saques ficam no portal de payouts, também da Whop.",
              },
              {
                step: "03",
                title: "Publique e venda",
                body: "Cada produto gera um checkout com a sua comissão. O comprador paga no embed, sem sair da página da loja.",
              },
            ].map((item) => (
              <article key={item.step}>
                <p className="text-xs tracking-[0.16em] text-primary">{item.step}</p>
                <h2 className="mt-2 text-2xl">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl">Lojas na thesain26</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Vitrines publicadas com produto à venda.
              </p>
            </div>
          </div>
          {stores.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed px-6 py-14 text-center">
              <p className="font-heading text-2xl">Nenhuma loja publicada ainda.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                A primeira vitrine aparece aqui assim que um vendedor colocar um produto no ar.
              </p>
              <Link
                href="/cadastro"
                className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 px-5")}
              >
                Criar minha loja
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <Link
                  key={store.id}
                  href={`/loja/${store.slug}`}
                  className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-heading text-2xl">{store.name}</h3>
                    {store.user.kycStatus === "verified" ? (
                      <Badge>Verificado</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {store.description || `Loja de ${store.user.name}`}
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {store._count.products}{" "}
                    {store._count.products === 1 ? "produto" : "produtos"}
                    {store.products[0]
                      ? ` · a partir de ${formatMoney(store.products[0].price)}`
                      : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>thesain26</p>
          <p>Pagamentos em Direct Charges pela Whop.</p>
        </div>
      </footer>
    </>
  );
}
