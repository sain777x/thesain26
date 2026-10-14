import { unwrapWebhook } from "@whop/sdk/helpers";
import { prisma } from "@/lib/prisma";
import { recordPayment } from "@/lib/sales";
import { syncKycStatus } from "@/lib/whop";

type WhopEvent = {
  id?: string;
  type?: string;
  account_id?: string;
  company_id?: string;
  data?: Record<string, unknown>;
};

/**
 * Webhook da Whop. A assinatura é Standard Webhooks: o helper confere
 * webhook-id, webhook-timestamp e webhook-signature com WHOP_WEBHOOK_SECRET
 * (o valor ws_..., sem reencodar). O corpo precisa ser o texto cru.
 */
export async function POST(request: Request) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "WHOP_WEBHOOK_SECRET não está configurado." },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event: WhopEvent;
  try {
    event = unwrapWebhook<WhopEvent>(payload, { headers, key: secret });
  } catch {
    return new Response("Assinatura inválida", { status: 400 });
  }

  const webhookId = headers["webhook-id"];
  if (webhookId) {
    const seen = await prisma.webhookEvent.findUnique({
      where: { id: webhookId },
    });
    if (seen) return new Response("OK", { status: 200 });
  }

  try {
    const type = event.type ?? "";
    const data = event.data ?? {};

    if (
      type === "payment.succeeded" ||
      type === "payment.pending" ||
      type === "payment.failed" ||
      type === "refund.created" ||
      type === "refund.updated"
    ) {
      await recordPayment(data, type);
    }

    if (
      type === "verification.succeeded" ||
      type === "payout_account.status_updated" ||
      type === "identity_profile.updated"
    ) {
      const bizId = event.account_id || event.company_id;
      if (bizId) {
        const seller = await prisma.user.findUnique({
          where: { whopBizId: bizId },
        });
        if (seller) {
          const snapshot = await syncKycStatus(bizId);
          await prisma.user.update({
            where: { id: seller.id },
            data: {
              kycStatus: snapshot.status,
              kycDetail: snapshot.detail,
              kycCheckedAt: new Date(),
            },
          });
        }
      }
    }

    if (webhookId) {
      await prisma.webhookEvent.create({
        data: { id: webhookId, type: type || "unknown" },
      });
    }
  } catch (error) {
    console.error("[thesain26] webhook", error);
    return new Response("Erro ao processar", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
