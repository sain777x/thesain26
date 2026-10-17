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

const schema = productBodySchema;

async function ownProduct(userId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, sellerId: userId },
    include: { store: true },
  });
  if (!product) throw new HttpError(404, "Produto não encontrado.");
  return product;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSeller();
    const { id } = await context.params;
    const current = await ownProduct(user.id, id);
    const body = schema.parse(await request.json());
    if (body.imageUrl && !/^https?:\/\//.test(body.imageUrl)) {
      throw new HttpError(400, "A imagem precisa ser uma URL http(s).");
    }
    if (!user.whopBizId) {
      throw new HttpError(400, "Connected account ainda não configurada.");
    }

    const price = Math.round(body.price * 100) / 100;
    const status = productStatus(body);
    const slug = await uniqueProductSlug(body.slug, current.id);
    const feePercent = await feePercentFor(user);

    // Nova Checkout Configuration para o preço principal, de novo com a comissão.
    // A Whop não atualiza application_fee_amount de um plan já criado por aqui,
    // então cada salvamento gera a variante atual e guarda plan_id e purchase_url.
    const checkout = await openSellerPlan({
      accountId: user.whopBizId,
      productId: current.id,
      sellerId: user.id,
      storeId: current.storeId,
      storeSlug: current.store.slug,
      name: body.name,
      subtitle: body.subtitle,
      description: body.description,
      whopProductId: current.whopProductId,
      price,
      currency: body.currency,
      feePercent,
      productType: body.productType,
      deliveryMethod: body.deliveryMethod,
    });

    const product = await prisma.product.update({
      where: { id: current.id },
      data: {
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
        whopProductId: checkout.whopProductId,
        whopPlanId: checkout.planId,
        whopCheckoutId: checkout.sessionId,
        whopPurchaseUrl: checkout.purchaseUrl,
        applicationFeeAmount: checkout.applicationFeeAmount,
      },
    });

    const warnings = await saveExtraPrices(
      {
        accountId: user.whopBizId,
        productId: current.id,
        sellerId: user.id,
        storeId: current.storeId,
        storeSlug: current.store.slug,
        name: body.name,
        subtitle: body.subtitle,
        description: body.description,
        whopProductId: checkout.whopProductId,
        price,
        currency: body.currency,
        feePercent,
        productType: body.productType,
        deliveryMethod: body.deliveryMethod,
      },
      body.prices,
    );

    return NextResponse.json({
      product,
      whopWarning: [checkout.warning, ...warnings].filter(Boolean).join(" ") || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Confira os dados do produto." },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSeller();
    const { id } = await context.params;
    const product = await ownProduct(user.id, id);
    const sales = await prisma.sale.count({ where: { productId: product.id } });
    if (sales > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data: { active: false, status: "draft" },
      });
      return NextResponse.json({ archived: true });
    }
    await prisma.product.delete({ where: { id: product.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
