import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { syncKycStatus } from "@/lib/whop";

export async function POST() {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Connected account ainda não configurada.");
    }
    const snapshot = await syncKycStatus(user.whopBizId);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        kycStatus: snapshot.status,
        kycDetail: snapshot.detail,
        kycCheckedAt: new Date(),
      },
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
