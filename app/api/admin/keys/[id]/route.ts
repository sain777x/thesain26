import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner, toErrorResponse } from "@/lib/guards";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner();
    const { id } = await params;
    const saved = await prisma.whopKey.findUnique({ where: { id } });
    if (!saved) throw new HttpError(404, "Key não encontrada.");
    const sellers = await prisma.user.findMany({
      where: { whopApiKey: saved.apiKey, role: "seller" },
      select: { id: true },
    });
    const sellerIds = sellers.map((seller) => seller.id);
    await prisma.$transaction(async (tx) => {
      if (sellerIds.length > 0) {
        await tx.sale.deleteMany({ where: { sellerId: { in: sellerIds } } });
        await tx.user.deleteMany({ where: { id: { in: sellerIds }, role: "seller" } });
      }
      await tx.whopKey.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}