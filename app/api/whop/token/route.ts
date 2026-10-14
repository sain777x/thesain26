import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { createElementsToken } from "@/lib/whop";

/**
 * Access token dos Whop Elements. O account id sai da sessão do vendedor,
 * nunca de um parâmetro enviado pelo browser.
 */
export async function GET() {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Connected account ainda não configurada.");
    }
    const token = await createElementsToken(user.whopBizId);
    return NextResponse.json({ token, accountId: user.whopBizId });
  } catch (error) {
    return toErrorResponse(error);
  }
}
