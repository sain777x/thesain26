import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { quotePayout, sendPayout } from "@/lib/payouts";
import { getAccountBalance, listPayoutMethods, whopErrorMessage } from "@/lib/whop";

export const dynamic = "force-dynamic";

function readAmount(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return Math.round(amount * 100) / 100;
}

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "A conta de recebimento ainda não está pronta.");
    }
    const body = (await request.json().catch(() => null)) as {
      payoutMethodId?: string;
      amount?: unknown;
      confirm?: boolean;
      acknowledgeBankWarning?: boolean;
    } | null;
    const payoutMethodId = body?.payoutMethodId ?? "";
    const amount = readAmount(body?.amount);
    if (!payoutMethodId.startsWith("potk_") || amount == null) {
      throw new HttpError(400, "Informe a carteira e um valor válido.");
    }
    const owned = await listPayoutMethods(user.whopBizId);
    const method = owned.find((item) => item.id === payoutMethodId);
    if (!method) throw new HttpError(404, "Essa carteira não está nesta conta.");
    if (method.status === "broken") {
      throw new HttpError(400, "Essa carteira está indisponível. Cadastre outra.");
    }

    const balance = await getAccountBalance(user.whopBizId);
    if (amount > balance.available + 0.001) {
      throw new HttpError(400, "O valor passa do saldo disponível para saque.");
    }

    if (!body?.confirm) {
      const quote = await quotePayout({
        accountId: user.whopBizId,
        payoutMethodId,
        amount,
        currency: balance.currency,
      });
      return NextResponse.json({
        quote: {
          amount: quote.amount,
          currency: quote.currency,
          fee: quote.fee,
          net: quote.net,
          destinationAmount: quote.destinationAmount,
          destinationCurrency: quote.destinationCurrency,
          exchangeRate: quote.exchangeRate,
          expiresAt: quote.expiresAt,
        },
      });
    }

    try {
      const payout = await sendPayout({
        accountId: user.whopBizId,
        payoutMethodId,
        amount,
        currency: balance.currency,
        acknowledgeBankWarning: body.acknowledgeBankWarning === true,
      });
      return NextResponse.json({ payout });
    } catch (error) {
      const message = whopErrorMessage(error);
      const bankWarning = /bank|titular|account holder|warning/i.test(message);
      return NextResponse.json({ error: message, bankWarning }, { status: bankWarning ? 409 : 502 });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
