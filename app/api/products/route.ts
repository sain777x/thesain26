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
});

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

    const body = schema.parse(await request.json());
    if (body.imageUrl && !/^https?:\/\//.test(body.imageUrl)) {
      throw new HttpError(400, "A imagem precisa ser uma URL http(s).");
    }

    const price = Math.round(body.price * 100) / 100;
    const feePercent = await feePercentFor(user);
    const product = await prisma.product.create({
      data: {
        storeId: user.store.id,
        sellerId: user.id,
        name: body.name,
        description: body.description,
        price,
        imageUrl: body.imageUrl || null,
        currency: "usd",
      },
    });

    try {
      const checkout = await createDirectChargeCheckout({
        accountId: user.whopBizId,
        price,
        feePercent,
        title: body.name,
        description: body.description,
        redirectUrl: `${appUrl()}/loja/${user.store.slug}/obrigado`,
        metadata: {
          platform: "thesain26",
          product_id: product.id,
          seller_id: user.id,
          store_id: user.store.id,
        },
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
      return NextResponse.json({ product: saved });
    } catch (error) {
      await prisma.product.delete({ where: { id: product.id } });
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Nome, descrição e preço (mínimo US$ 1) são obrigatórios." },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
