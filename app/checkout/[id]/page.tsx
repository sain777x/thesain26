import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckoutEmbed } from "@/components/checkout-embed";
import { Logo } from "@/components/logo";
import { requestOrigin } from "@/lib/checkout-link";
import { openProductCheckout } from "@/lib/checkout-session";
import { formatMoney, isHexColor } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { whopErrorMessage } from "@/lib/whop";

export const dynamic = "force-dynamic";

async function findCheckoutProduct(id: string) {
  return prisma.product.findFirst({
    where: {
      active: true,
      store: { published: true },
      OR: [{ id }, { whopPlanId: id }, { slug: id }],
    },
    include: { store: true },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await findCheckoutProduct(id);
  if (!product) return { title: "Checkout" };
  return { title: `Checkout — ${product.name}` };
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preco?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const product = await findCheckoutProduct(id);
  if (!product) notFound();
  if (product.id !== id) {
    const preco = query.preco ? `?preco=${encodeURIComponent(query.preco)}` : "";
    redirect(`/checkout/${product.id}${preco}`);
  }

  let sessionId: string | null = null;
  let planId: string | null = product.whopPlanId;
  let purchaseUrl = product.whopPurchaseUrl;
  let checkoutError: string | null = null;
  let amount = product.price;
  let currency = product.currency;
  let priceLabel: string | null = null;

  if (product.whopPlanId || query.preco) {
    try {
      const opened = await openProductCheckout(product.id, query.preco);
      sessionId = opened.checkout.sessionId;
      planId = opened.checkout.planId;
      purchaseUrl = opened.checkout.purchaseUrl ?? purchaseUrl;
      amount = opened.amount;
      currency = opened.currency;
      priceLabel = opened.priceLabel;
    } catch (error) {
      checkoutError = whopErrorMessage(error);
    }
  } else {
    checkoutError = "Este produto ainda não tem checkout da Whop.";
  }

  const accent = isHexColor(product.store.accentColor)
    ? product.store.accentColor
    : "#0f6e56";
  const origin = await requestOrigin();
  const returnUrl = `${origin}/loja/${product.store.slug}/obrigado?produto=${encodeURIComponent(product.name)}&checkout=${product.id}`;
  const price = formatMoney(amount, currency);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href={`/loja/${product.store.slug}`}
            className="flex min-w-0 items-center gap-3 font-semibold"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-xs text-primary-foreground">
              {product.store.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{product.store.name}</span>
          </Link>
          <Link
            href={`/loja/${product.store.slug}`}
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
          >
            Produtos
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Link
          href={`/loja/${product.store.slug}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true">←</span> Voltar para a loja
        </Link>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Checkout</h1>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <section className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
              <p className="mb-4 text-sm text-muted-foreground">Resumo do pedido</p>
              <div className="flex gap-4">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="size-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="grid size-16 shrink-0 place-items-center rounded-xl text-xs text-white/80"
                    style={{ backgroundColor: accent }}
                  >
                    Digital
                  </div>
                )}
                <div className="min-w-0">
                  <p className="line-clamp-2 font-semibold">{product.name}</p>
                  {product.subtitle || priceLabel ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {priceLabel || product.subtitle}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {product.store.name}
                  </p>
                </div>
              </div>
              <div className="my-5 border-t" />
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">{product.name}</span>
                <span className="shrink-0">{price}</span>
              </div>
              <div className="my-4 border-t" />
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-semibold">{price}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Pagamento único</p>
            </div>
            <div className="rounded-2xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-foreground/10">
              Pagamentos processados com segurança pela Whop. Os dados do cartão não passam por este site.
            </div>
          </section>

          <section className="lg:col-span-3">
            {sessionId ? (
              <CheckoutEmbed
                sessionId={sessionId}
                planId={planId}
                returnUrl={returnUrl}
                accent={accent}
              />
            ) : (
              <div className="grid min-h-80 place-items-center rounded-2xl bg-card px-5 py-10 text-center ring-1 ring-foreground/10">
                <div>
                  <p className="text-sm text-destructive">
                    {checkoutError ?? "O checkout da Whop não abriu."}
                  </p>
                  {purchaseUrl ? (
                    <a href={purchaseUrl} className="mt-4 inline-block text-sm underline">
                      Abrir o checkout hospedado da Whop
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} {product.store.name}</p>
          <Logo href="/" />
        </div>
      </footer>
    </div>
  );
}
