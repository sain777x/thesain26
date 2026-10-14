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
  pending: "Pendente",
  failed: "Falhou",
  refunded: "Reembolsada",
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

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
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
