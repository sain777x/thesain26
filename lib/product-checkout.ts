import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { HttpError } from "@/lib/guards";
import { slugify } from "@/lib/slug";
import { createDirectChargeCheckout, whopErrorMessage } from "@/lib/whop";
import type { ProductBody } from "@/lib/product-schema";

export async function uniqueProductSlug(raw: string, productId?: string) {
  const slug = raw.trim() ? slugify(raw) : "";
  if (!slug) return null;
  const taken = await prisma.product.findFirst({
    where: {
      slug,
      ...(productId ? { NOT: { id: productId } } : {}),
    },
  });
  if (taken) {
    throw new HttpError(409, "Esse endereço de produto já está em uso.");
  }
  return slug;
}

type CheckoutTarget = {
  accountId: string;
  productId: string;
  sellerId: string;
  storeId: string;
  storeSlug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  feePercent: number;
  productType: string;
  deliveryMethod: string;
  priceLabel?: string;
};

/**
 * Cria uma Checkout Configuration de Direct Charge e devolve plan_id,
 * purchase_url e a comissão. Cada opção de preço ganha a própria variante,
 * sempre com application_fee_amount.
 */
export async function openSellerPlan(input: CheckoutTarget) {
  return createDirectChargeCheckout({
    accountId: input.accountId,
    price: input.price,
    currency: input.currency,
    feePercent: input.feePercent,
    title: input.priceLabel ? `${input.name} — ${input.priceLabel}` : input.name,
    description: input.description,
    redirectUrl: `${appUrl()}/loja/${input.storeSlug}/obrigado`,
    metadata: {
      platform: "thesain26",
      product_id: input.productId,
      seller_id: input.sellerId,
      store_id: input.storeId,
      product_type: input.productType,
      delivery: input.deliveryMethod,
      price_label: input.priceLabel || "principal",
    },
  });
}

export async function saveExtraPrices(
  input: CheckoutTarget,
  prices: ProductBody["prices"],
) {
  const createdIds: string[] = [];
  const warnings: string[] = [];

  for (const extra of prices) {
    const amount = Math.round(extra.amount * 100) / 100;
    const label = extra.label?.trim() || "Opção";
    try {
      const checkout = await openSellerPlan({
        ...input,
        price: amount,
        priceLabel: label,
      });
      const row = await prisma.productPrice.create({
        data: {
          productId: input.productId,
          label,
          amount,
          currency: input.currency,
          whopPlanId: checkout.planId,
          whopPurchaseUrl: checkout.purchaseUrl,
          applicationFeeAmount: checkout.applicationFeeAmount,
        },
      });
      createdIds.push(row.id);
    } catch (error) {
      warnings.push(`${label}: ${whopErrorMessage(error)}`);
    }
  }

  if (createdIds.length > 0 || prices.length === 0) {
    await prisma.productPrice.deleteMany({
      where: {
        productId: input.productId,
        ...(createdIds.length > 0 ? { id: { notIn: createdIds } } : {}),
      },
    });
  }

  return warnings;
}
