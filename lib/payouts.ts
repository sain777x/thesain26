import { prisma } from "@/lib/prisma";
import { getWhop, whopErrorMessage, type BalanceSnapshot } from "@/lib/whop";
async function getWhopForAccount(accountId: string) {
  const user = await prisma.user.findFirst({ where: { whopBizId: accountId }, select: { whopApiKey: true } });
  return getWhop(user?.whopApiKey);
}


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

export type PendingSettlement = {
  at: string;
  amount: number;
};

export type SellerTreasury = {
  currency: string;
  total: number;
  available: number;
  pendingNextDay: number;
  pendingReleaseAt: string | null;
  pendingSettlements: PendingSettlement[];
  reserveTotal: number;
  reserve14: number;
  reserve30: number;
  reserveOpen: number;
  withdrawn: number;
  withdrawing: number;
  standing: AccountStanding | null;
  error: string | null;
};

export type PlatformTreasury = {
  id: string;
  title: string;
  treasury: SellerTreasury;
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
  undated: string | null;
  actions: { action: string }[];
}): AccountStanding {
  const has = (action: string) => input.actions.some((item) => item.action === action);
  const identity = has("verify_identity") || input.undated === "kyc_incomplete";
  const missingInfo =
    has("submit_information_request") || input.undated === "pending_information_request";
  const payout =
    input.actions.some((action) => PAYOUT_ACTIONS.has(action.action)) ||
    input.undated === "update_payout_profile";
  const compliance = input.undated === "compliance_review";
  const blocked = input.undated === "withdrawals_disabled";
  const held = has("review_held_payments");
  const notes: string[] = [];

  if (identity) notes.push("Libera saques e gastos.");
  if (missingInfo) notes.push("Falta informação adicional");
  if (payout) notes.push("Saque incompleto");
  if (compliance) notes.push("Verificação em análise");
  if (blocked) notes.push("Saques bloqueados");
  if (held) notes.push("Pagamentos em espera");
  if (input.payments === "rejected") notes.push("Pagamentos recusados");
  else if (
    !identity &&
    !missingInfo &&
    !payout &&
    !compliance &&
    (input.payments === "pending" || input.payments === "monitoring")
  ) {
    notes.push("Pagamentos em análise");
  }

  const without = (label: string, tone: AccountStanding["tone"], drop: string): AccountStanding => ({
    label,
    tone,
    notes: notes.filter((note) => note !== drop),
  });

  if (input.status === "suspended") {
    const reason = suspensionReason(input.statusReason);
    return {
      label: "Suspensa",
      tone: "bad",
      notes: [reason, ...notes].filter((note): note is string => Boolean(note)),
    };
  }
  if (identity) return without("Verificação de identidade", "warn", "");
  if (missingInfo) return without("Falta informação", "warn", "Falta informação adicional");
  if (payout) return without("Saque incompleto", "warn", "Saque incompleto");
  if (compliance) return without("Em análise", "warn", "Verificação em análise");
  if (blocked) return without("Saques bloqueados", "bad", "Saques bloqueados");
  if (input.payments === "rejected") return without("Pagamentos recusados", "bad", "Pagamentos recusados");
  if (held) return without("Pagamentos em espera", "warn", "Pagamentos em espera");
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
  const account = await (await getWhopForAccount(accountId)).accounts.retrieve({ id: accountId });
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
  const client = await getWhopForAccount(params.accountId);
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
  const client = await getWhopForAccount(params.accountId);
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
  const client = await getWhopForAccount(params.accountId);
  await client.payouts.methods.delete({ id });
}

export async function quotePayout(params: {
  accountId: string;
  payoutMethodId: string;
  amount: number;
  currency: string;
}): Promise<PayoutQuoteView> {
  const client = await getWhopForAccount(params.accountId);
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
  const client = await getWhopForAccount(params.accountId);
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
    total: 0,
    available: 0,
    pendingNextDay: 0,
    pendingReleaseAt: null,
    pendingSettlements: [],
    reserveTotal: 0,
    reserve14: 0,
    reserve30: 0,
    reserveOpen: 0,
    withdrawn: 0,
    withdrawing: 0,
    standing: null,
    error,
  };
}

function decimal(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function settlementInstant(date: string) {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return `${day}T00:00:00.000Z`;
}

function splitReserve(
  total: number,
  unlocks: { date: string; amount: string }[],
  now: number,
) {
  let reserve14 = 0;
  let reserve30 = 0;
  let dated = 0;
  for (const unlock of unlocks) {
    const amount = decimal(unlock.amount);
    const at = settlementInstant(unlock.date);
    if (amount == null || amount <= 0 || !at) continue;
    const when = new Date(at).getTime();
    if (when <= now) continue;
    const days = (when - now) / 86_400_000;
    if (days <= 21) reserve14 += amount;
    else reserve30 += amount;
    dated += amount;
  }
  let reserveOpen = 0;
  if (dated === 0) {
    reserveOpen = total;
  } else if (total > dated + 0.009) {
    reserveOpen = total - dated;
  } else if (dated > total + 0.009 && total > 0) {
    const scale = total / dated;
    reserve14 *= scale;
    reserve30 *= scale;
  }
  return { reserve14, reserve30, reserveOpen };
}

function nextRelease(candidates: string[], today: string) {
  return candidates.filter((value) => value.slice(0, 10) >= today).sort()[0] ?? null;
}

/**
 * Saldo como a Whop mostra na conta: disponível, pendente (com o dia da
 * liberação) e reserva. A data do pendente vem de pending_settlements.
 */
export async function loadSellerTreasury(accountId: string, apiKey?: string | null): Promise<SellerTreasury> {
  const client = getWhop(apiKey);
  let accountStatus: string | null = null;
  let accountReason: string | null = null;
  let accountActions: { action: string }[] = [];
  let undated: string | null = null;
  let breakdown: {
    available: string;
    pending: string;
    reserve: string;
    pending_settlements: { amount: string; date: string }[];
  } | null = null;
  let balanceTotal: number | null = null;

  try {
    const account = await client.accounts.retrieve({ id: accountId });
    accountStatus = account.status;
    accountReason = account.status_reason;
    accountActions = account.required_actions ?? [];
    undated = account.payment_controls?.undated_pending_reason ?? null;
    const token =
      account.balances.find((item) => item.symbol.toUpperCase() === "USD") ??
      account.balances[0];
    if (token) {
      breakdown = token.breakdown;
      balanceTotal = decimal(token.balance);
    }
  } catch (error) {
    console.error("[thesain26] accounts.retrieve", whopErrorMessage(error));
  }

  let ledgerError: string | null = null;
  let payments: string | null = null;
  let ledgerAvailable: number | null = null;
  let ledgerPending: number | null = null;
  let ledgerReserve: number | null = null;
  let currency = "usd";
  try {
    const ledger = await client.ledgerAccounts.retrieve({ id: accountId });
    payments = ledger.payments_approval_status;
    const usd = ledger.balances.find((item) => item.currency === "usd") ?? ledger.balances[0];
    currency = usd?.currency ?? "usd";
    ledgerAvailable = usd?.balance ?? 0;
    ledgerPending = usd?.pending_balance ?? 0;
    ledgerReserve = usd?.reserve_balance ?? 0;
  } catch (error) {
    ledgerError = whopErrorMessage(error);
    console.error("[thesain26] ledgerAccounts.retrieve", ledgerError);
  }

  if (!breakdown && ledgerAvailable == null) {
    const fallback = emptyTreasury("usd", ledgerError ?? "Não foi possível ler o saldo.");
    if (accountStatus || accountReason || accountActions.length > 0 || undated) {
      fallback.standing = accountStanding({
        status: accountStatus,
        statusReason: accountReason,
        payments,
        undated,
        actions: accountActions,
      });
    }
    return fallback;
  }

  const available = decimal(breakdown?.available) ?? ledgerAvailable ?? 0;
  const pending = decimal(breakdown?.pending) ?? ledgerPending ?? 0;
  const reserveTotal = decimal(breakdown?.reserve) ?? ledgerReserve ?? 0;
  const total = balanceTotal ?? available + pending + reserveTotal;
  const standing = accountStanding({
    status: accountStatus,
    statusReason: accountReason,
    payments,
    undated,
    actions: accountActions,
  });
  const pendingSettlements = (breakdown?.pending_settlements ?? [])
    .map((item) => {
      const at = settlementInstant(item.date);
      const amount = decimal(item.amount);
      if (!at || amount == null || amount <= 0) return null;
      return { at, amount };
    })
    .filter((item): item is PendingSettlement => Boolean(item))
    .sort((left, right) => left.at.localeCompare(right.at));

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const upcomingSettlements = pendingSettlements.filter((item) => item.at.slice(0, 10) >= today);
  let unlocks: { date: string; amount: string }[] = [];
  if (reserveTotal > 0) {
    try {
      const reserves = await client.accounts.reserves.list({ account_id: accountId });
      const row =
        reserves.data.find((item) => item.currency === currency) ?? reserves.data[0];
      unlocks = row?.unlocks_by_date ?? [];
    } catch (error) {
      console.error("[thesain26] accounts.reserves.list", whopErrorMessage(error));
    }
  }
  const { reserve14, reserve30, reserveOpen } = splitReserve(reserveTotal, unlocks, now);
  const reserveDays = new Set(
    unlocks.map((item) => item.date.slice(0, 10)).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)),
  );

  let pendingReleaseAt = pending > 0 ? nextRelease(upcomingSettlements.map((item) => item.at), today) : null;
  if (pending > 0 && !pendingReleaseAt) {
    try {
      const activity = await client.financialActivity.list({
        account_id: accountId,
        currency,
        available_after: today,
        direction: "money_in",
        include_resource: false,
        limit: 100,
      });
      const candidates: string[] = [];
      for (const row of activity.data) {
        if (!row.available_at) continue;
        const day = row.available_at.slice(0, 10);
        if (day <= today || reserveDays.has(day)) continue;
        if (activityValue(row) <= 0) continue;
        candidates.push(settlementInstant(day) ?? row.available_at);
      }
      pendingReleaseAt = nextRelease(candidates, today);
    } catch (error) {
      console.error("[thesain26] financialActivity.list", whopErrorMessage(error));
    }
  }

  let withdrawn = 0;
  let withdrawing = 0;
  try {
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
  } catch (error) {
    console.error("[thesain26] payouts.list", whopErrorMessage(error));
  }

  return {
    currency,
    total,
    available,
    pendingNextDay: pending,
    pendingReleaseAt,
    pendingSettlements: upcomingSettlements,
    reserveTotal,
    reserve14,
    reserve30,
    reserveOpen,
    withdrawn,
    withdrawing,
    standing,
    error: null,
  };
}

/** Conta Whop da plataforma, onde caem as comissões dos vendedores. */
export async function loadPlatformTreasury(): Promise<PlatformTreasury> {
  try {
    const client = await getWhopForAccount(params.accountId);
    const me = await client.accounts.me();
    const id = me.parent_account?.id && me.parent_account.id !== me.id ? me.parent_account.id : me.id;
    const account = id === me.id ? me : await client.accounts.retrieve({ id });
    return {
      id,
      title: account.title || "Conta principal",
      treasury: await loadSellerTreasury(id),
    };
  } catch (error) {
    return {
      id: "",
      title: "Conta principal",
      treasury: emptyTreasury("usd", whopErrorMessage(error)),
    };
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
