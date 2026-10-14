import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { createConnectedAccount } from "@/lib/whop";

/** Tenta de novo a Connected Account se o cadastro não conseguiu criá-la. */
export async function POST() {
  try {
    const user = await requireSeller();
    if (user.whopBizId) {
      return NextResponse.json({ bizId: user.whopBizId });
    }
    if (!user.store) {
      throw new HttpError(400, "Crie a loja antes de conectar a conta Whop.");
    }

    const bizId = await createConnectedAccount({
      email: user.email,
      title: user.store.name,
      externalId: user.id,
    });
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: user.id },
      data: { whopBizId: bizId },
    });
    return NextResponse.json({ bizId });
  } catch (error) {
    return toErrorResponse(error);
  }
}
