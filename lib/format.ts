const kycLabels: Record<string, string> = {
  not_started: "Não iniciado",
  pending: "Em análise",
  verified: "Verificado",
  action_required: "Ação necessária",
  rejected: "Recusado",
};

export function kycLabel(status: string) {
  return kycLabels[status] ?? status;
}

/** Rótulos do painel de verificações. */
export function kycReviewLabel(status: string) {
  if (status === "verified") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  if (status === "pending" || status === "action_required") return "Em análise";
  return "Não iniciado";
}

/**
 * Status da conta no painel, no vocabulário pedido para o vendedor.
 * Suspensa vem da Whop (conta suspended) ou de um KYC recusado.
 */
export function sellerAccountLabel(kycStatus: string, accountStatus: string) {
  if (accountStatus === "suspended" || kycStatus === "rejected") return "Suspensa";
  if (kycStatus === "verified") return "Ativa";
  if (kycStatus === "pending" || kycStatus === "action_required") return "Em análise";
  return "Pendente KYC";
}

const saleStatusLabels: Record<string, string> = {
  paid: "Paga",
  succeeded: "Paga",
  pending: "Pendente",
  open: "Em aberto",
  authorized: "Autorizada",
  failed: "Falhou",
  void: "Anulada",
  uncollectible: "Incobrável",
  refunded: "Reembolsada",
  partially_refunded: "Reembolso parcial",
};

export function saleStatusLabel(status: string) {
  return saleStatusLabels[status] ?? status;
}

export function formatMoney(amount: number, currency = "usd") {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

const payoutStatusLabels: Record<string, string> = {
  requested: "Solicitado",
  in_review: "Em análise",
  processing: "A caminho",
  completed: "Pago",
  reversed: "Estornado",
  canceled: "Cancelado",
  failed: "Falhou",
  denied: "Recusado",
  created: "Salva",
  active: "Ativa",
  broken: "Indisponível",
};

export function payoutStatusLabel(status: string) {
  return payoutStatusLabels[status] ?? status;
}

/** Prazo curto no mesmo vocabulário do seletor de carteira: Hoje, Amanhã, N dias. */
export function arrivalLabel(value: string | null | undefined) {
  if (!value) return "A confirmar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "A confirmar";
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const days = Math.round((end - start) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `${days} dias`;
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Data e hora da liberação, no mesmo horário UTC que a Whop mostra no saldo. */
export function formatRelease(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value);
  if (dateOnly) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

export function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "amount" in value) {
    return parseMoney((value as { amount: unknown }).amount);
  }
  return null;
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
