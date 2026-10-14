import Link from "next/link";
import { CopyCheckoutLink } from "@/components/copy-checkout-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { checkoutShareUrl, requestOrigin } from "@/lib/checkout-link";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHODS, PRODUCT_TYPES, labelOf } from "@/lib/business";
import { formatMoney } from "@/lib/format";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const user = await requireSeller();
  const origin = await requestOrigin();
  const products = await prisma.product.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Catálogo</p>
          <h1 className="text-4xl">Produtos</h1>
        </div>
        <Link
          href="/painel/produtos/novo"
          className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
        >
          Novo produto
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-heading text-2xl">Nenhum produto ainda</p>
          <p className="mt-2 text-sm text-muted-foreground">
            O primeiro produto já sai com checkout da Whop e a comissão da thesain26.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl bg-card ring-1 ring-foreground/10">
          {products.map((product) => {
            const checkoutUrl = checkoutShareUrl(origin, product.id);
            return (
              <li key={product.id} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{product.name}</p>
                      <Badge variant={product.status === "active" ? "secondary" : "outline"}>
                        {product.status === "active" ? "Ativo" : "Rascunho"}
                      </Badge>
                    </div>
                    {product.subtitle ? (
                      <p className="mt-1 text-sm text-muted-foreground">{product.subtitle}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {labelOf(PRODUCT_TYPES, product.productType)} ·{" "}
                      {labelOf(DELIVERY_METHODS, product.deliveryMethod)} ·{" "}
                      {formatMoney(product.price, product.currency)}
                      {product.applicationFeeAmount != null
                        ? ` · comissão ${formatMoney(product.applicationFeeAmount, product.currency)}`
                        : " · checkout ainda não gerado"}
                    </p>
                  </div>
                  <CopyCheckoutLink url={checkoutUrl} />
                </div>
                <Link
                  href={`/painel/produtos/${product.id}`}
                  className="text-sm underline sm:pt-1"
                >
                  Editar
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
