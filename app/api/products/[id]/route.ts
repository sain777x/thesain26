import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { feePercentFor } from "@/lib/platform";
import { createDirectChargeCheckout } from "@/lib/whop";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(4000),
  price: z.number().min(1).max(10000),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  active: z.boolean(),
});

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
    const feePercent = await feePercentFor(user);
    const checkout = await createDirectChargeCheckout({
      accountId: user.whopBizId,
      price,
      feePercent,
      title: body.name,
      description: body.description,
      redirectUrl: `${appUrl()}/loja/${current.store.slug}/obrigado`,
      metadata: {
        platform: "thesain26",
        product_id: current.id,
        seller_id: user.id,
        store_id: current.storeId,
      },
    });

    const product = await prisma.product.update({
      where: { id: current.id },
      data: {
        name: body.name,
        description: body.description,
        price,
        imageUrl: body.imageUrl || null,
        active: body.active,
        whopPlanId: checkout.planId,
        whopCheckoutId: checkout.sessionId,
        whopPurchaseUrl: checkout.purchaseUrl,
        applicationFeeAmount: checkout.applicationFeeAmount,
      },
    });
    return NextResponse.json({ product });
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
        data: { active: false },
      });
      return NextResponse.json({ archived: true });
    }
    await prisma.product.delete({ where: { id: product.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
