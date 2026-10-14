import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { recordPayment } from "@/lib/sales";
import { listAccountPayments } from "@/lib/whop";

/** Puxa pagamentos da connected account quando o webhook ainda não chegou. */
export async function POST() {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Connected account ainda não configurada.");
    }
    const payments = await listAccountPayments(user.whopBizId);
    let saved = 0;
    for (const payment of payments) {
      const row = await recordPayment(payment as unknown as Record<string, unknown>);
      if (row) saved += 1;
    }
    return NextResponse.json({ saved });
  } catch (error) {
    return toErrorResponse(error);
  }
}
