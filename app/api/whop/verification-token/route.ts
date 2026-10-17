import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { createElementsToken } from "@/lib/whop";

/**
 * Token só para o formulário de pendências embutido.
 * O account id sai da sessão. O navegador não recebe a chave da plataforma.
 */
export async function GET() {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Connected account ainda não configurada.");
    }
    const token = await createElementsToken(user.whopBizId, ["identity:read", "identity:write"]);
    return NextResponse.json(
      { token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
