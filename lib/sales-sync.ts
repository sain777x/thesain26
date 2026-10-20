import { recordPayment } from "@/lib/sales";
import { listAccountPayments } from "@/lib/whop";

/**
 * Fallback da listagem de vendas. O tempo real continua sendo o webhook
 * POST /api/webhooks/whop. Esta função puxa os pagamentos recentes da
 * connected account quando o vendedor abre o painel e o webhook ainda não
 * chegou (localhost, ou entrega atrasada).
 */
export async function syncSellerSales(accountId: string, apiKey?: string | null) {
  const payments = await listAccountPayments(accountId, apiKey);
  let saved = 0;
  for (const payment of payments) {
    const row = await recordPayment(payment as unknown as Record<string, unknown>);
    if (row) saved += 1;
  }
  return saved;
}
