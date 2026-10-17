import { NextResponse } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { createAccountLink } from "@/lib/whop";

const schema = z.object({
  useCase: z.enum(["account_onboarding", "payouts_portal"]),
  returnTo: z.enum(["verificacoes", "saldo"]).optional(),
});

/**
 * Gera o Account Link e devolve a URL para o navegador redirecionar.
 * return_url e refresh_url voltam para o painel da thesain26.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(
        400,
        "Sua connected account ainda não existe. Conecte a Whop antes do KYC.",
      );
    }

    const { useCase, returnTo } = schema.parse(await request.json());
    const origin = appUrl();
    const backToVerifications = returnTo === "verificacoes" || useCase === "account_onboarding";
    const returnUrl = backToVerifications
      ? `${origin}/painel/verificacoes?onboarding=return`
      : `${origin}/painel/saldo?payouts=return`;
    const refreshUrl = backToVerifications
      ? `${origin}/painel/verificacoes?onboarding=refresh`
      : `${origin}/painel/saldo?payouts=refresh`;

    const url = await createAccountLink({
      accountId: user.whopBizId,
      useCase,
      returnUrl,
      refreshUrl,
    });

    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Uso do link inválido." }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
