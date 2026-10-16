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

export type AccountStanding = {
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
  notes: string[];
};

export type SellerTreasury = {
  currency: string;
  available: number;
  pendingNextDay: number;
  pendingReleaseAt: string | null;
  reserve14: number;
  reserve30: number;
  reserveOpen: number;
  withdrawn: number;
  withdrawing: number;
  standing: AccountStanding | null;
  error: string | null;
};

const PAYOUT_ACTIONS = new Set([
  "update_payout_profile",
  "accept_payout_terms",
  "reauthorize_payout_methods",
  "update_automatic_withdrawal_method",
]);

function suspensionReason(reason: string | null) {
  if (!reason) return null;
  const text = reason.replace(/^Suspended\s*-\s*/i, "").trim();
  if (/fraud/i.test(text)) return "Atividade fraudulenta";
  return text || null;
}

/** Situação da conta na Whop, sem alterar o estado de KYC. */
export function accountStanding(input: {
  status: string | null;
  statusReason: string | null;
  payments: string | null;
  actions: { action: string }[];
}): AccountStanding {
  const notes: string[] = [];
  const missingInfo = input.actions.some((action) => action.action === "submit_information_request");
  if (missingInfo) notes.push("Falta informação adicional");
  if (input.payments === "rejected") notes.push("Pagamentos recusados");
  else if (input.payments === "pending" || input.payments === "monitoring") notes.push("Pagamentos em análise");
  if (input.actions.some((action) => PAYOUT_ACTIONS.has(action.action))) notes.push("Saque incompleto");
  if (input.actions.some((action) => action.action === "review_held_payments")) notes.push("Pagamentos em espera");

  if (input.status === "suspended") {
    const reason = suspensionReason(input.statusReason);
    return {
      label: "Suspensa",
      tone: "bad",
      notes: [reason, ...notes].filter((note): note is string => Boolean(note)),
    };
  }
  if (missingInfo) {
    return {
      label: "Falta informação",
      tone: "warn",
      notes: notes.filter((note) => note !== "Falta informação adicional"),
    };
  }
  if (input.payments === "rejected") {
    return {
      label: "Pagamentos recusados",
      tone: "bad",
      notes: notes.filter((note) => note !== "Pagamentos recusados"),
    };
  }
  if (notes.length > 0) return { label: notes[0], tone: "warn", notes: notes.slice(1) };
  if (input.status === "active") return { label: "Ativa", tone: "ok", notes: [] };
  return { label: "Sem status", tone: "muted", notes: [] };
}

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

function missingPayoutSetup(error: unknown) {
  return /no payout setup/i.test(whopErrorMessage(error));
}

async function platformAccountId(accountId: string) {
  const account = await getWhop().accounts.retrieve({ id: accountId });
  const parent = account.parent_account?.id;
  if (!parent || parent === accountId) return null;
  return parent;
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
}): Promise<{ methods: CatalogMethod[]; setupRequired: boolean }> {
  let items = await collectSupported(params);
  let setupRequired = false;
  if (items.length === 0) {
    const parentId = await platformAccountId(params.accountId).catch(() => null);
    if (parentId) {
      items = await collectSupported({ ...params, accountId: parentId });
      setupRequired = items.length > 0;
    }
  }
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
  return { methods: rows, setupRequired };
}

export async function getPayoutFields(params: {
  accountId: string;
  country: string;
  supportedPayoutMethodId: string;
  destinationCurrency: string;
}): Promise<PayoutField[]> {
  let items: Awaited<ReturnType<typeof collectSupported>> = [];
  try {
    items = await collectSupported({
      accountId: params.accountId,
      country: params.country,
      supportedPayoutMethodId: params.supportedPayoutMethodId,
      destinationCurrency: params.destinationCurrency,
    });
  } catch (error) {
    if (!missingPayoutSetup(error)) throw error;
  }
  if (!items.some((item) => item.required_fields?.length)) {
    const parentId = await platformAccountId(params.accountId).catch(() => null);
    if (parentId) {
      items = await collectSupported({
        accountId: parentId,
        country: params.country,
        supportedPayoutMethodId: params.supportedPayoutMethodId,
        destinationCurrency: params.destinationCurrency,
      });
    }
  }
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
  try {
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
  } catch (error) {
    if (missingPayoutSetup(error)) {
      throw new Error(
        "A Whop ainda não abriu o saque desta conta. Conclua a verificação em Verificações e adicione a carteira de novo.",
      );
    }
    throw error;
  }
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
    pendingReleaseAt: null,
    reserve14: 0,
    reserve30: 0,
    reserveOpen: 0,
    withdrawn: 0,
    withdrawing: 0,
    standing: null,
    error,
  };
}

function nextRelease(candidates: string[], now: number) {
  const future = candidates.filter((value) => new Date(value).getTime() >= now).sort();
  if (future[0]) return future[0];
  const recent = candidates
    .filter((value) => now - new Date(value).getTime() < 36 * 3_600_000)
    .sort();
  return recent[recent.length - 1] ?? null;
}

/**
 * Separa o saldo da connected account:
 * pendente do dia seguinte, reserva que libera em até 14 dias, reserva de 30 dias,
 * saques já pagos e saques ainda a caminho.
 */
export async function loadSellerTreasury(accountId: string): Promise<SellerTreasury> {
  const client = getWhop();
  let accountStatus: string | null = null;
  let accountReason: string | null = null;
  let accountActions: { action: string }[] = [];
  try {
    const account = await client.accounts.retrieve({ id: accountId });
    accountStatus = account.status;
    accountReason = account.status_reason;
    accountActions = account.required_actions ?? [];
  } catch (error) {
    console.error("[thesain26] accounts.retrieve", whopErrorMessage(error));
  }

  try {
    const ledger = await client.ledgerAccounts.retrieve({ id: accountId });
    const standing = accountStanding({
      status: accountStatus,
      statusReason: accountReason,
      payments: ledger.payments_approval_status,
      actions: accountActions,
    });
    const usd =
      ledger.balances.find((item) => item.currency === "usd") ?? ledger.balances[0];
    const currency = usd?.currency ?? "usd";
    const available = usd?.balance ?? 0;
    const pending = usd?.pending_balance ?? 0;
    const reserve = usd?.reserve_balance ?? 0;
    const today = new Date().toISOString().slice(0, 10);

    let reserve14 = 0;
    let reserve30 = 0;
    const releaseCandidates: string[] = [];
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
        if (!Number.isFinite(when)) continue;
        const amount = activityValue(row);
        if (amount <= 0) continue;
        const days = (when - now) / 86_400_000;
        if (days <= 2) {
          if (days > -1.5) releaseCandidates.push(row.available_at);
          continue;
        }
        if (when <= now) continue;
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

    const now = Date.now();
    return {
      currency,
      available,
      pendingNextDay: pending,
      pendingReleaseAt: pending > 0 ? nextRelease(releaseCandidates, now) : null,
      reserve14,
      reserve30,
      reserveOpen,
      withdrawn,
      withdrawing,
      standing,
      error: null,
    };
  } catch (error) {
    const fallback = emptyTreasury("usd", whopErrorMessage(error));
    if (accountStatus || accountReason || accountActions.length > 0) {
      fallback.standing = accountStanding({
        status: accountStatus,
        statusReason: accountReason,
        payments: null,
        actions: accountActions,
      });
    }
    return fallback;
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
