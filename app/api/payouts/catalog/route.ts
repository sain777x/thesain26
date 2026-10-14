import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { getPayoutFields, isPayoutCurrency, listPayoutCatalog } from "@/lib/payouts";
import { getAccountBalance } from "@/lib/whop";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "A conta de recebimento ainda não está pronta.");
    }
    const url = new URL(request.url);
    const country = (url.searchParams.get("country") ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new HttpError(400, "Escolha um país.");
    }
    const method = url.searchParams.get("method");
    const destination = (url.searchParams.get("destination") ?? "").toLowerCase();

    if (method) {
      if (!method.startsWith("podst_")) {
        throw new HttpError(400, "Método de pagamento inválido.");
      }
      if (!isPayoutCurrency(destination)) {
        throw new HttpError(400, "Moeda de destino inválida.");
      }
      const fields = await getPayoutFields({
        accountId: user.whopBizId,
        country,
        supportedPayoutMethodId: method,
        destinationCurrency: destination,
      });
      return NextResponse.json({ fields });
    }

    const balance = await getAccountBalance(user.whopBizId).catch(() => null);
    const amount = balance && balance.available >= 1 ? balance.available : 100;
    const catalog = await listPayoutCatalog({
      accountId: user.whopBizId,
      country,
      amount,
      currency: balance?.currency ?? "usd",
    });
    return NextResponse.json({
      methods: catalog.methods,
      setupRequired: catalog.setupRequired,
      previewAmount: amount,
      currency: balance?.currency ?? "usd",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
