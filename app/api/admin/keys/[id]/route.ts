import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, toErrorResponse } from "@/lib/guards";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner();
    const { id } = await params;
    await prisma.whopKey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
