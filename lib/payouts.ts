import { getWhop, whopErrorMessage, type BalanceSnapshot } from "@/lib/whop";

export type CatalogMethod = {
  id: string;
  name: string;
  deliveryType: string;
  iconUrl: string | null;
  destinationCurrency: string;
  fee: number | null;
  arrival: string | null;
  minLimit: number | null;
  maxLimit: number | null;
};

export type PayoutField = {
  id: string;
  label: string;
  inputType: string;
  options: string[] | null;
  placeholder: string | null;
  required: boolean;
  sensitive: boolean;
  validation: string | null;
};

export type PayoutQuoteView = {
  amount: number;
  currency: string;
  fee: number;
  net: number;
  destinationAmount: number | null;
  destinationCurrency: string | null;
  exchangeRate: number | null;
  expiresAt: string;
  quoteToken: string;
};

export type SellerTreasury = {
  currency: string;
  available: number;
  pendingNextDay: number;
  reserve14: number;
  reserve30: number;
  reserveOpen: number;
  withdrawn: number;
  withdrawing: number;
  error: string | null;
};

const OPEN_PAYOUT = new Set(["requested", "in_review", "processing"]);

/** Fiat (usd, brl) e cripto (btc, eth, usdc, usdt). Não limita a 3 letras. */
export function isPayoutCurrency(value: string) {
  return /^[a-z0-9][a-z0-9_]{1,19}$/.test(value);
}

function moneyAmount(value: { amount: string } | number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const parsed = Number(value.amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function activityValue(row: {
  amount: string;
  usd_amount: string | null;
  currency: { code: string; precision: string };
}) {
  if (row.usd_amount != null && row.currency.code.toLowerCase() === "usd") {
    const parsed = Number(row.usd_amount);
    if (Number.isFinite(parsed)) return parsed;
  }
  const raw = Number(row.amount);
  const precision = Number(row.currency.precision);
  if (!Number.isFinite(raw) || !Number.isFinite(precision) || precision === 0) return 0;
  return raw / precision;
}

async function collectSupported(params: {
  accountId: string;
  country?: string;
  amount?: number;
  currency?: string;
  supportedPayoutMethodId?: string;
  destinationCurrency?: string;
}) {
  const client = getWhop();
  let page = await client.payouts.supportedMethods.list({
    account_id: params.accountId,
    country: params.country,
    amount: params.amount,
    currency: params.currency,
    supported_payout_method_id: params.supportedPayoutMethodId,
    destination_currency: params.destinationCurrency,
    first: 50,
  });
  const items = [...page.data];
  for (let index = 0; index < 3 && page.hasNextPage(); index += 1) {
    page = await page.getNextPage();
    items.push(...page.data);
  }
  return items;
}

/** Métodos que a conta pode cadastrar no país, uma linha por moeda de destino. */
export async function listPayoutCatalog(params: {
  accountId: string;
  country: string;
  amount: number;
  currency: string;
}): Promise<CatalogMethod[]> {
  const items = await collectSupported(params);
  const rows: CatalogMethod[] = [];
  for (const item of items) {
    const quotes = item.quotes ?? [];
    if (quotes.length === 0) {
      rows.push({
        id: item.id,
        name: item.name || "Carteira",
        deliveryType: item.delivery_type,
        iconUrl: item.icon_url,
        destinationCurrency: params.currency,
        fee: null,
        arrival: null,
        minLimit: null,
        maxLimit: null,
      });
      continue;
    }
    for (const quote of quotes) {
      const lane = quote.standard ?? quote.instant;
      rows.push({
        id: item.id,
        name: item.name || "Carteira",
        deliveryType: item.delivery_type,
        iconUrl: item.icon_url,
        destinationCurrency: quote.destination_currency,
        fee: lane?.fee ?? null,
        arrival: lane?.estimated_arrival ?? null,
        minLimit: quote.min_limit,
        maxLimit: quote.max_limit,
      });
    }
  }
  return rows;
}

export async function getPayoutFields(params: {
  accountId: string;
  country: string;
  supportedPayoutMethodId: string;
  destinationCurrency: string;
}): Promise<PayoutField[]> {
  const items = await collectSupported({
    accountId: params.accountId,
    country: params.country,
    supportedPayoutMethodId: params.supportedPayoutMethodId,
    destinationCurrency: params.destinationCurrency,
  });
  const match =
    items.find((item) => item.id === params.supportedPayoutMethodId) ?? items[0];
  return (match?.required_fields ?? []).map((field) => ({
    id: field.id,
    label: field.label,
    inputType: field.input_type,
    options: field.options,
    placeholder: field.placeholder,
    required: field.required,
    sensitive: field.sensitive,
    validation: field.validation,
  }));
}

export function validatePayoutFields(fields: PayoutField[], values: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.id] ?? "").trim();
    if (field.required && !value) {
      throw new Error(`Preencha ${field.label}.`);
    }
    if (!value) continue;
    if (value.length > 200) {
      throw new Error(`${field.label} passou do limite.`);
    }
    if (field.validation) {
      try {
        if (!new RegExp(field.validation).test(value)) {
          throw new Error(`${field.label} está em um formato inválido.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("formato")) throw error;
      }
    }
    clean[field.id] = value;
  }
  return clean;
}

export async function savePayoutMethod(params: {
  accountId: string;
  supportedPayoutMethodId: string;
  destinationCurrency: string;
  nickname: string;
  fields: Record<string, string>;
  isDefault: boolean;
}) {
  const client = getWhop();
  const created = await client.payouts.methods.create(
    {
      account_id: params.accountId,
      supported_payout_method_id: params.supportedPayoutMethodId,
      destination_currency: params.destinationCurrency,
      nickname: params.nickname.slice(0, 80),
      fields: params.fields,
      is_default: params.isDefault,
    },
    { idempotencyKey: crypto.randomUUID() },
  );
  return created.id;
}

export async function removePayoutMethod(id: string) {
  const client = getWhop();
  await client.payouts.methods.delete({ id });
}

export async function quotePayout(params: {
  accountId: string;
  payoutMethodId: string;
  amount: number;
  currency: string;
}): Promise<PayoutQuoteView> {
  const client = getWhop();
  const quote = await client.payouts.createQuote(
    {
      account_id: params.accountId,
      payout_method_id: params.payoutMethodId,
      amount: params.amount,
      currency: params.currency,
      speed: "standard",
      statement_descriptor: "THESAIN26",
    },
    { idempotencyKey: crypto.randomUUID() },
  );
  return {
    amount: moneyAmount(quote.amount),
    currency: quote.amount.currency || params.currency,
    fee: moneyAmount(quote.fee),
    net: moneyAmount(quote.net_amount),
    destinationAmount: quote.destination_amount ? moneyAmount(quote.destination_amount) : null,
    destinationCurrency: quote.destination_amount?.currency ?? null,
    exchangeRate: quote.exchange_rate,
    expiresAt: quote.expires_at,
    quoteToken: quote.quote_token,
  };
}

export async function sendPayout(params: {
  accountId: string;
  payoutMethodId: string;
  amount: number;
  currency: string;
  acknowledgeBankWarning?: boolean;
}) {
  const quote = await quotePayout(params);
  const client = getWhop();
  const payout = await client.payouts.create(
    {
      account_id: params.accountId,
      payout_method_id: params.payoutMethodId,
      amount: params.amount,
      currency: params.currency,
      quote_token: quote.quoteToken,
      speed: "standard",
      statement_descriptor: "THESAIN26",
      acknowledge_bank_warning: params.acknowledgeBankWarning,
      metadata: { platform: "thesain26" },
    },
    { idempotencyKey: crypto.randomUUID() },
  );
  return {
    id: payout.id,
    status: payout.status,
    amount: Number(payout.amount) || params.amount,
    fee: Number(payout.fee_amount) || quote.fee,
    net: Number(payout.net_amount) || quote.net,
    currency: payout.currency || params.currency,
    arrival: payout.estimated_arrival,
  };
}

function emptyTreasury(currency: string, error: string | null): SellerTreasury {
  return {
    currency,
    available: 0,
    pendingNextDay: 0,
    reserve14: 0,
    reserve30: 0,
    reserveOpen: 0,
    withdrawn: 0,
    withdrawing: 0,
    error,
  };
}

/**
 * Separa o saldo da connected account:
 * pendente do dia seguinte, reserva que libera em até 14 dias, reserva de 30 dias,
 * saques já pagos e saques ainda a caminho.
 */
export async function loadSellerTreasury(accountId: string): Promise<SellerTreasury> {
  const client = getWhop();
  try {
    const ledger = await client.ledgerAccounts.retrieve({ id: accountId });
    const usd =
      ledger.balances.find((item) => item.currency === "usd") ?? ledger.balances[0];
    const currency = usd?.currency ?? "usd";
    const available = usd?.balance ?? 0;
    const pending = usd?.pending_balance ?? 0;
    const reserve = usd?.reserve_balance ?? 0;
    const today = new Date().toISOString().slice(0, 10);

    let reserve14 = 0;
    let reserve30 = 0;
    try {
      const activity = await client.financialActivity.list({
        account_id: accountId,
        currency,
        available_after: today,
        direction: "money_in",
        include_resource: false,
        limit: 100,
      });
      const now = Date.now();
      for (const row of activity.data) {
        if (!row.available_at) continue;
        const when = new Date(row.available_at).getTime();
        if (!Number.isFinite(when) || when <= now) continue;
        const amount = activityValue(row);
        if (amount <= 0) continue;
        const days = (when - now) / 86_400_000;
        if (days <= 2) continue;
        if (days <= 21) reserve14 += amount;
        else reserve30 += amount;
      }
    } catch (error) {
      console.error("[thesain26] financialActivity.list", whopErrorMessage(error));
    }

    const dated = reserve14 + reserve30;
    let reserveOpen = 0;
    if (reserve > dated + 0.009) {
      reserveOpen = reserve - dated;
    } else if (dated > reserve + 0.009 && reserve > 0 && dated > 0) {
      const scale = reserve / dated;
      reserve14 *= scale;
      reserve30 *= scale;
    } else if (dated === 0) {
      reserveOpen = reserve;
    }

    let withdrawn = 0;
    let withdrawing = 0;
    let page = await client.payouts.list({ account_id: accountId, first: 50 });
    for (let index = 0; index < 3; index += 1) {
      for (const item of page.data) {
        const amount = Number(item.amount) || 0;
        if (item.status === "completed") withdrawn += amount;
        else if (OPEN_PAYOUT.has(item.status)) withdrawing += amount;
      }
      if (!page.hasNextPage()) break;
      page = await page.getNextPage();
    }

    return {
      currency,
      available,
      pendingNextDay: pending,
      reserve14,
      reserve30,
      reserveOpen,
      withdrawn,
      withdrawing,
      error: null,
    };
  } catch (error) {
    return emptyTreasury("usd", whopErrorMessage(error));
  }
}

export function treasuryOf(balance: BalanceSnapshot | null): Pick<
  SellerTreasury,
  "available" | "pendingNextDay" | "currency"
> {
  return {
    available: balance?.available ?? 0,
    pendingNextDay: balance?.pending ?? 0,
    currency: balance?.currency ?? "usd",
  };
}
