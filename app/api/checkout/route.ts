import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/guards";
import { openProductCheckout } from "@/lib/checkout-session";

const schema = z.object({
  productId: z.string().min(1),
});

/**
 * Abre uma sessão de checkout (Direct Charge) para o produto.
 * A página pública usa a mesma função no servidor; esta rota existe para
 * recriar o embed sem expor a API key.
 */
export async function POST(request: Request) {
  try {
    const { productId } = schema.parse(await request.json());
    const { checkout } = await openProductCheckout(productId);
    return NextResponse.json({
      sessionId: checkout.sessionId,
      planId: checkout.planId,
      purchaseUrl: checkout.purchaseUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
