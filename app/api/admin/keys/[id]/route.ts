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
    await prisma.$transaction([
      prisma.whopKey.delete({ where: { id } }),
      prisma.user.updateMany({
        where: { whopApiKey: saved.apiKey },
        data: { whopApiKey: null },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}