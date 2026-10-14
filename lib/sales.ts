import { prisma } from "@/lib/prisma";
import { parseMoney } from "@/lib/format";

function normalizeStatus(raw: string | undefined, eventType?: string) {
  if (eventType === "payment.succeeded") return "paid";
  if (eventType === "payment.failed") return "failed";
  if (eventType === "payment.pending") return "pending";
  if (eventType === "refund.created" || eventType === "refund.updated") {
    return "refunded";
  }
  switch (raw) {
    case "paid":
    case "succeeded":
    case "success":
      return "paid";
    case "pending":
    case "open":
    case "processing":
      return "pending";
    case "failed":
    case "void":
    case "uncollectible":
    case "canceled":
    case "cancelled":
      return "failed";
    case "refunded":
    case "partially_refunded":
      return "refunded";
    default:
      return raw || "pending";
  }
}

function stringField(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * Grava a venda de forma idempotente. O pagamento da Whop é a fonte da verdade;
 * o metadata que enviamos no checkout liga a venda ao produto da thesain26.
 */
export async function recordPayment(
  data: Record<string, unknown>,
  eventType?: string,
) {
  const paymentId = stringField(data, "id");
  if (!paymentId || !paymentId.startsWith("pay_")) return null;

  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : {};
  const productId = stringField(metadata, "product_id");
  const sellerIdFromMeta = stringField(metadata, "seller_id");
  const planId = stringField(data, "plan_id");
  const accountId =
    stringField(data, "account_id") ?? stringField(data, "company_id");

  const product = productId
    ? await prisma.product.findUnique({ where: { id: productId } })
    : planId
      ? await prisma.product.findFirst({ where: { whopPlanId: planId } })
      : null;

  const seller = sellerIdFromMeta
    ? await prisma.user.findUnique({ where: { id: sellerIdFromMeta } })
    : accountId
      ? await prisma.user.findUnique({ where: { whopBizId: accountId } })
      : product
        ? await prisma.user.findUnique({ where: { id: product.sellerId } })
        : null;

  const user =
    data.user && typeof data.user === "object"
      ? (data.user as Record<string, unknown>)
      : null;
  const buyerEmail =
    stringField(data, "customer_email") ??
    (user ? stringField(user, "email") : null);

  const amount =
    parseMoney(data.total) ??
    parseMoney(data.subtotal) ??
    parseMoney(data.usd_total) ??
    product?.price ??
    0;
  const feeFromPayload = parseMoney(data.application_fee);
  const status = normalizeStatus(
    stringField(data, "status") ?? undefined,
    eventType,
  );
  const applicationFee =
    status === "refunded"
      ? 0
      : (feeFromPayload ?? product?.applicationFeeAmount ?? 0);

  return prisma.sale.upsert({
    where: { whopPaymentId: paymentId },
    create: {
      whopPaymentId: paymentId,
      sellerId: seller?.id ?? product?.sellerId ?? null,
      productId: product?.id ?? null,
      buyerEmail,
      amount,
      applicationFee,
      currency: stringField(data, "currency") ?? product?.currency ?? "usd",
      status,
      whopAccountId: accountId ?? seller?.whopBizId ?? null,
    },
    update: {
      status,
      amount,
      applicationFee,
      buyerEmail: buyerEmail ?? undefined,
      sellerId: seller?.id ?? product?.sellerId ?? undefined,
      productId: product?.id ?? undefined,
    },
  });
}
