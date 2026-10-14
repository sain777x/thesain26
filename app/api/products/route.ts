import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { feePercentFor } from "@/lib/platform";
import { productBodySchema, productStatus } from "@/lib/product-schema";
import {
  openSellerPlan,
  saveExtraPrices,
  uniqueProductSlug,
} from "@/lib/product-checkout";
import { whopErrorMessage } from "@/lib/whop";

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.store) throw new HttpError(400, "Crie sua loja antes do produto.");
    if (!user.whopBizId) {
      throw new HttpError(
        400,
        "Conecte a conta Whop antes de publicar um produto.",
      );
    }

    const body = productBodySchema.parse(await request.json());
    if (body.imageUrl && !/^https?:\/\//.test(body.imageUrl)) {
      throw new HttpError(400, "A imagem precisa ser uma URL http(s).");
    }

    const price = Math.round(body.price * 100) / 100;
    const status = productStatus(body);
    const slug = await uniqueProductSlug(body.slug);
    const feePercent = await feePercentFor(user);
    const product = await prisma.product.create({
      data: {
        storeId: user.store.id,
        sellerId: user.id,
        name: body.name,
        subtitle: body.subtitle,
        description: body.description,
        productType: body.productType,
        deliveryMethod: body.deliveryMethod,
        price,
        currency: body.currency,
        imageUrl: body.imageUrl || null,
        slug,
        status,
        active: status === "active",
      },
    });

    try {
      // Direct Charge na conta do vendedor. O plan nasce com application_fee_amount.
      const checkout = await openSellerPlan({
        accountId: user.whopBizId,
        productId: product.id,
        sellerId: user.id,
        storeId: user.store.id,
        storeSlug: user.store.slug,
        name: body.name,
        description: body.description,
        price,
        currency: body.currency,
        feePercent,
        productType: body.productType,
        deliveryMethod: body.deliveryMethod,
      });
      const saved = await prisma.product.update({
        where: { id: product.id },
        data: {
          whopPlanId: checkout.planId,
          whopCheckoutId: checkout.sessionId,
          whopPurchaseUrl: checkout.purchaseUrl,
          applicationFeeAmount: checkout.applicationFeeAmount,
        },
      });
      const warnings = await saveExtraPrices(
        {
          accountId: user.whopBizId,
          productId: product.id,
          sellerId: user.id,
          storeId: user.store.id,
          storeSlug: user.store.slug,
          name: body.name,
          description: body.description,
          price,
          currency: body.currency,
          feePercent,
          productType: body.productType,
          deliveryMethod: body.deliveryMethod,
        },
        body.prices,
      );
      return NextResponse.json({
        product: saved,
        whopWarning: warnings.length ? warnings.join(" ") : null,
      });
    } catch (error) {
      await prisma.product.delete({ where: { id: product.id } }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Nome e preço (mínimo 1 na moeda escolhida) são obrigatórios." },
        { status: 400 },
      );
    }
    console.error("[thesain26] product.create", whopErrorMessage(error));
    return toErrorResponse(error);
  }
}
