import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner, toErrorResponse } from "@/lib/guards";

const schema = z.object({
  feePercentOverride: z.number().min(0.5).max(80).nullable(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner();
    const { id } = await context.params;
    const seller = await prisma.user.findFirst({
      where: { id, role: "seller" },
    });
    if (!seller) throw new HttpError(404, "Vendedor não encontrado.");
    const body = schema.parse(await request.json());
    const updated = await prisma.user.update({
      where: { id: seller.id },
      data: { feePercentOverride: body.feePercentOverride },
    });
    return NextResponse.json({
      id: updated.id,
      feePercentOverride: updated.feePercentOverride,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Comissão inválida. Vazio usa a taxa global." },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
