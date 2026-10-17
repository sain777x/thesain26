import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { HttpError } from "@/lib/guards";
import { feePercentFor } from "@/lib/platform";
import { createDirectChargeCheckout, syncCheckoutProduct, whopErrorMessage } from "@/lib/whop";

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
  const catalog = {
    accountId: product.seller.whopBizId,
    productId: product.id,
    sellerId: product.sellerId,
    storeId: product.storeId,
    storeSlug: product.store.slug,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    price: option?.amount ?? product.price,
    currency: option?.currency ?? product.currency,
    feePercent,
    productType: product.productType,
    deliveryMethod: product.deliveryMethod,
    priceLabel: option?.label || undefined,
    whopProductId: product.whopProductId,
  };

  // Plan antigo, sem produto na Whop, faz o checkout mostrar o nome da empresa.
  let activeProductId = product.whopProductId;
  if (!activeProductId) {
    try {
      activeProductId = await syncCheckoutProduct({
        accountId: product.seller.whopBizId,
        name: product.name,
        subtitle: product.subtitle,
        description: product.description,
      });
    } catch (error) {
      if (!/access_pass|not authorized|forbidden/i.test(whopErrorMessage(error))) throw error;
      activeProductId = null;
    }
  }

  if (activeProductId && !product.whopProductId) {
    const created = await createDirectChargeCheckout({
      accountId: product.seller.whopBizId,
      price: catalog.price,
      currency: catalog.currency,
      feePercent,
      title: option?.label?.trim() || product.name,
      description: product.description,
      whopProductId: activeProductId,
      redirectUrl: `${appUrl()}/loja/${product.store.slug}/obrigado?produto=${encodeURIComponent(product.name)}`,
      metadata: {
        platform: "thesain26",
        product_id: product.id,
        seller_id: product.sellerId,
        store_id: product.storeId,
        price_label: option?.label || "principal",
      },
    });
    if (option) {
      await prisma.productPrice.update({
        where: { id: option.id },
        data: {
          whopPlanId: created.planId,
          whopPurchaseUrl: created.purchaseUrl,
          applicationFeeAmount: created.applicationFeeAmount,
        },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: { whopProductId: activeProductId },
      });
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          whopProductId: activeProductId,
          whopPlanId: created.planId,
          whopCheckoutId: created.sessionId,
          whopPurchaseUrl: created.purchaseUrl,
          applicationFeeAmount: created.applicationFeeAmount,
        },
      });
    }
    return {
      product,
      checkout: created,
      amount: catalog.price,
      currency: catalog.currency,
      priceLabel: option?.label || null,
    };
  }

  if (activeProductId) {
    try {
      await syncCheckoutProduct({
        accountId: product.seller.whopBizId,
        whopProductId: activeProductId,
        name: product.name,
        subtitle: product.subtitle,
        description: product.description,
      });
    } catch (error) {
      if (!/access_pass|not authorized|forbidden/i.test(whopErrorMessage(error))) throw error;
    }
  }

  // Reabre a sessão em cima do plan já criado (com a comissão). Não gera outro plan.
  const checkout = await createDirectChargeCheckout({
    accountId: product.seller.whopBizId,
    price: catalog.price,
    currency: catalog.currency,
    feePercent,
    title: option?.label?.trim() || product.name,
    description: product.description,
    whopProductId: product.whopProductId,
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
