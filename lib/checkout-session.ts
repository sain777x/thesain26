import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { HttpError } from "@/lib/guards";
import { feePercentFor } from "@/lib/platform";
import { createDirectChargeCheckout } from "@/lib/whop";

export async function openProductCheckout(productId: string, priceId?: string | null) {
  const product = await prisma.product.findFirst({
    where: { id: productId, active: true, store: { published: true } },
    include: { store: true, seller: true, prices: true },
  });
  if (!product) throw new HttpError(404, "Produto indisponível.");
  if (!product.seller.whopBizId) {
    throw new HttpError(
      400,
      "O vendedor ainda não conectou a conta de pagamento.",
    );
  }

  const option = priceId ? product.prices.find((item) => item.id === priceId) : null;
  if (priceId && !option) {
    throw new HttpError(404, "Opção de preço indisponível.");
  }
  const planId = option?.whopPlanId ?? product.whopPlanId;
  if (!planId) {
    throw new HttpError(400, "Este produto ainda não tem checkout da Whop.");
  }

  const feePercent = await feePercentFor(product.seller);
  // Reabre a sessão em cima do plan já criado (com a comissão). Não gera outro plan.
  const checkout = await createDirectChargeCheckout({
    accountId: product.seller.whopBizId,
    price: option?.amount ?? product.price,
    currency: option?.currency ?? product.currency,
    feePercent,
    title: option?.label ? `${product.name} — ${option.label}` : product.name,
    description: product.description,
    planId,
    redirectUrl: `${appUrl()}/loja/${product.store.slug}/obrigado?produto=${encodeURIComponent(product.name)}`,
    metadata: {
      platform: "thesain26",
      product_id: product.id,
      seller_id: product.sellerId,
      store_id: product.storeId,
      price_label: option?.label || "principal",
    },
  });

  return {
    product,
    checkout,
    amount: option?.amount ?? product.price,
    currency: option?.currency ?? product.currency,
    priceLabel: option?.label || null,
  };
}
