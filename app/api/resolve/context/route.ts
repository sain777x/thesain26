import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

/** Retorna só o contexto necessário para o resolver.py gerar as provas localmente. */
export async function GET() {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) throw new HttpError(400, "Conecte a conta Whop.");
    const store = await prisma.store.findFirst({ where: { userId: user.id } });
    const product = store
      ? await prisma.product.findFirst({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } })
      : null;
    const sale = await prisma.sale.findFirst({
      where: { sellerId: user.id, status: "paid" },
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });
    return NextResponse.json({
      store: {
        name: store?.name || user.name,
        slug: store?.slug,
        description: store?.description,
        socialUrl: store?.socialUrl,
        website: store?.website,
        instagram: store?.instagram,
        city: store?.addressCity,
        state: store?.addressState,
        country: store?.country || "US",
      },
      user: { name: user.name },
      product: product ? {
        name: product.name,
        subtitle: product.subtitle,
        description: product.description,
        price: product.price,
        currency: product.currency,
        deliveryMethod: product.deliveryMethod,
      } : null,
      buyer: sale ? {
        email: sale.buyerEmail || "",
        name: (sale.buyerEmail || "buyer").split("@")[0],
        amount: sale.amount,
        currency: sale.currency,
        at: sale.createdAt.toISOString(),
        productName: sale.product?.name || product?.name || "Program",
      } : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
