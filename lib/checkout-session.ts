import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { HttpError } from "@/lib/guards";
import { feePercentFor } from "@/lib/platform";
import { createDirectChargeCheckout } from "@/lib/whop";

export async function openProductCheckout(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, active: true, store: { published: true } },
    include: { store: true, seller: true },
  });
  if (!product) throw new HttpError(404, "Produto indisponível.");
  if (!product.seller.whopBizId) {
    throw new HttpError(
      400,
      "O vendedor ainda não conectou a conta de pagamento.",
    );
  }
  if (!product.whopPlanId) {
    throw new HttpError(400, "Este produto ainda não tem checkout da Whop.");
  }

  const feePercent = await feePercentFor(product.seller);
  const checkout = await createDirectChargeCheckout({
    accountId: product.seller.whopBizId,
    price: product.price,
    feePercent,
    title: product.name,
    description: product.description,
    planId: product.whopPlanId,
    redirectUrl: `${appUrl()}/loja/${product.store.slug}/obrigado?produto=${encodeURIComponent(product.name)}`,
    metadata: {
      platform: "thesain26",
      product_id: product.id,
      seller_id: product.sellerId,
      store_id: product.storeId,
    },
  });

  return { product, checkout };
}
