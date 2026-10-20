import type { Whop } from "@whop/sdk";
import { prisma } from "@/lib/prisma";

async function getWhopForSale(saleId: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { seller: true } });
  return getWhop(sale?.seller?.whopApiKey);
}

import { getWhop, whopErrorMessage } from "@/lib/whop";

type Viewer = { id: string; role: string };

export type SaleMoney = { amount: number; currency: string };

export type SaleAddress = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type SaleDetail = {
  id: string;
  paymentId: string;
  title: string;
  sellerName: string | null;
  status: string;
  substatus: string | null;
  currency: string;
  total: number;
  subtotal: number | null;
  tax: number | null;
  platformFee: number;
  processingFee: number | null;
  sellerShare: number | null;
  amountAfterFees: number | null;
  billingReason: string | null;
  createdAt: string;
  paidAt: string | null;
  settlementAt: string | null;
  refundable: boolean;
  refundedAt: string | null;
  refundedAmount: number | null;
  autoRefunded: boolean;
  failure: string | null;
  decline: string | null;
  card: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    displayName: string | null;
  } | null;
  methodType: string | null;
  threeDs: boolean;
  buyer: {
    name: string | null;
    email: string | null;
    username: string | null;
    phone: string | null;
  };
  billing: SaleAddress | null;
  shipping: SaleAddress | null;
  map: { lat: number; lon: number; label: string } | null;
  riskScore: number | null;
  checks: {
    address: string | null;
    zip: string | null;
    name: string | null;
    cvv: string | null;
    authorization: string | null;
    arn: string | null;
  } | null;
  rules: { id: string; name: string | null; action: string }[];
  holds: { type: string; amount: number; currency: string; releaseAt: string | null; percentage: number | null }[];
  items: { label: string; quantity: number; amount: number | null; currency: string; sku: string | null }[];
  refunds: { id: string; amount: number; currency: string; status: string; createdAt: string; reason: string | null }[];
  timeline: { at: string; label: string }[];
  whopError: string | null;
};

function major(value: { amount: string; currency?: string } | number | null | undefined, currency: string): SaleMoney | null {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: value, currency };
  if (value && typeof value === "object") {
    const amount = Number(value.amount);
    if (Number.isFinite(amount)) return { amount, currency: value.currency || currency };
  }
  return null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function toAddress(address: Whop.PaymentAddress | null): SaleAddress | null {
  if (!address) return null;
  return {
    name: address.name,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postal_code,
    country: address.country,
  };
}

function addressLabel(address: SaleAddress | null) {
  if (!address) return null;
  const parts = [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function locate(label: string | null) {
  if (!label) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(label)}`,
      {
        headers: { "User-Agent": "thesain26/1.0 (ficha da venda)" },
        signal: controller.signal,
        next: { revalidate: 86_400 },
      },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as { lat?: string; lon?: string }[];
    const lat = Number(rows[0]?.lat);
    const lon = Number(rows[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, label };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pushEvent(events: { at: string; label: string }[], at: string | null | undefined, label: string) {
  if (!at) return;
  events.push({ at, label });
}

export async function loadSaleDetail(saleId: string, viewer: Viewer): Promise<SaleDetail | null> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { product: true, seller: true },
  });
  if (!sale) return null;
  if (viewer.role !== "owner" && sale.sellerId !== viewer.id) return null;

  const currency = sale.currency || "usd";
  const base: SaleDetail = {
    id: sale.id,
    paymentId: sale.whopPaymentId,
    title: sale.product?.name ?? "Venda",
    sellerName: sale.seller?.name ?? null,
    status: sale.status,
    substatus: null,
    currency,
    total: sale.amount,
    subtotal: null,
    tax: null,
    platformFee: sale.applicationFee,
    processingFee: null,
    sellerShare: round2(sale.amount - sale.applicationFee),
    amountAfterFees: null,
    billingReason: null,
    createdAt: sale.createdAt.toISOString(),
    paidAt: sale.status === "paid" ? sale.createdAt.toISOString() : null,
    settlementAt: null,
    refundable: false,
    refundedAt: null,
    refundedAmount: null,
    autoRefunded: false,
    failure: null,
    decline: null,
    card: null,
    methodType: null,
    threeDs: false,
    buyer: { name: null, email: sale.buyerEmail, username: null, phone: null },
    billing: null,
    shipping: null,
    map: null,
    riskScore: null,
    checks: null,
    rules: [],
    holds: [],
    items: sale.product
      ? [{ label: sale.product.name, quantity: 1, amount: sale.amount, currency, sku: null }]
      : [],
    refunds: [],
    timeline: [{ at: sale.createdAt.toISOString(), label: "Venda registrada" }],
    whopError: null,
  };

  if (!sale.whopPaymentId.startsWith("pay_")) return base;

  let payment: Whop.Payment | null = null;
  try {
    payment = await getWhop(sale.seller?.whopApiKey).payments.retrieve({ id: sale.whopPaymentId });
  } catch (error) {
    base.whopError = whopErrorMessage(error);
    return base;
  }

  const total = major(payment.total, payment.currency)?.amount ?? sale.amount;
  const after = major(payment.amount_after_fees, payment.currency);
  const subtotal = major(payment.subtotal, payment.currency);
  const tax = major(payment.tax_amount, payment.currency);
  const refunded = major(payment.refunded_amount, payment.currency);
  const processing = after ? round2(Math.max(0, total - after.amount)) : null;
  const sellerShare = after ? round2(after.amount - sale.applicationFee) : round2(total - sale.applicationFee);

  const events: { at: string; label: string }[] = [];
  pushEvent(events, payment.created_at, "Pedido criado");
  pushEvent(events, payment.paid_at, "Pagamento confirmado");
  pushEvent(events, payment.settlement_time_at, "Liberação do saldo");
  pushEvent(events, payment.refunded_at, "Reembolso");
  pushEvent(events, payment.dispute_alerted_at, "Alerta de disputa");
  pushEvent(events, payment.last_payment_attempt_at, "Tentativa de cobrança");
  if (payment.failure_message) pushEvent(events, payment.updated_at, payment.failure_message);

  let refunds: Whop.Refund[] = [];
  try {
    const page = await getWhop(sale.seller?.whopApiKey).refunds.list({ payment_id: sale.whopPaymentId, first: 20 });
    refunds = page.data;
    for (const refund of refunds) {
      pushEvent(events, refund.created_at, `Reembolso ${refund.status}`);
    }
  } catch (error) {
    base.whopError = base.whopError ?? whopErrorMessage(error);
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  const billing = toAddress(payment.billing_address);
  const billingLabel = addressLabel(billing);
  const map = await locate(billingLabel);

  const items = payment.line_items.length
    ? payment.line_items.map((item) => ({
        label: item.product_title || item.label || item.plan_title || sale.product?.name || "Item",
        quantity: item.quantity,
        amount: major(item.subtotal, payment.currency)?.amount ?? null,
        currency: item.subtotal?.currency || payment.currency,
        sku: item.sku,
      }))
    : base.items;

  return {
    ...base,
    title: items[0]?.label || base.title,
    status: payment.status || sale.status,
    substatus: payment.substatus,
    currency: payment.currency || currency,
    total,
    subtotal: subtotal?.amount ?? null,
    tax: tax?.amount ?? null,
    processingFee: processing,
    sellerShare,
    amountAfterFees: after?.amount ?? null,
    billingReason: payment.billing_reason,
    createdAt: payment.created_at,
    paidAt: payment.paid_at,
    settlementAt: payment.settlement_time_at,
    refundable: payment.refundable,
    refundedAt: payment.refunded_at,
    refundedAmount: refunded?.amount ?? null,
    autoRefunded: payment.auto_refunded,
    failure: payment.failure_message,
    decline: payment.decline_code,
    card: payment.payment_instrument
      ? {
          brand: payment.payment_instrument.card?.brand ?? null,
          last4: payment.payment_instrument.card?.last4 ?? null,
          expMonth: payment.payment_instrument.card?.exp_month ?? null,
          expYear: payment.payment_instrument.card?.exp_year ?? null,
          displayName: payment.payment_instrument.display_name,
        }
      : null,
    methodType: payment.payment_method_type,
    threeDs: payment.three_ds_verified,
    buyer: {
      name: payment.billing_address?.name || payment.user?.name || null,
      email: payment.customer_email || sale.buyerEmail,
      username: payment.user?.username || null,
      phone: payment.customer_phone,
    },
    billing,
    shipping: toAddress(payment.shipping_address),
    map,
    riskScore: payment.risk_score,
    checks: payment.verification_checks
      ? {
          address: payment.verification_checks.address_line1,
          zip: payment.verification_checks.zip_code,
          name: payment.verification_checks.card_holder_name,
          cvv: payment.verification_checks.card_security_code,
          authorization: payment.verification_checks.authorization_code,
          arn: payment.verification_checks.arn,
        }
      : null,
    rules: (payment.payment_rule_matches ?? []).map((rule) => ({
      id: rule.id,
      name: rule.name,
      action: rule.action,
    })),
    holds: (payment.holds ?? []).map((hold) => ({
      type: hold.type,
      amount: major(hold.amount, payment.currency)?.amount ?? 0,
      currency: hold.amount.currency || payment.currency,
      releaseAt: hold.release_at,
      percentage: hold.percentage,
    })),
    items,
    refunds: refunds.map((refund) => ({
      id: refund.id,
      amount: major(refund.amount, payment.currency)?.amount ?? major(refund.original_amount, payment.currency)?.amount ?? 0,
      currency: refund.amount?.currency || refund.original_amount.currency || payment.currency,
      status: refund.status,
      createdAt: refund.created_at,
      reason: refund.reason,
    })),
    timeline: events.length ? events : base.timeline,
  };
}

export async function refundOwnedSale(saleId: string, viewer: Viewer) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { seller: true },
  });
  if (!sale || (viewer.role !== "owner" && sale.sellerId !== viewer.id)) {
    return { error: "Venda não encontrada.", status: 404 as const };
  }
  const client = getWhop(sale.seller?.whopApiKey);
  const payment = await client.payments.retrieve({ id: sale.whopPaymentId });
  if (!payment.refundable) {
    return { error: "Este pagamento não pode ser reembolsado.", status: 400 as const };
  }
  await client.payments.refund(
    { id: sale.whopPaymentId },
    { idempotencyKey: `refund-${sale.whopPaymentId}` },
  );
  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: "refunded", applicationFee: 0 },
  });
  return { error: null, status: 200 as const };
}
