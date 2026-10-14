/**
 * Tarefas de verificação no formato da Whop: cada item é uma pendência
 * separada (KYC, prova de vendas, documento extra) e o vendedor escolhe
 * qual abrir primeiro. Os títulos vêm da API; esta função só organiza.
 */

export type TaskCategory = "kyc" | "proof" | "payout" | "extra";
export type TaskStatus = "not_started" | "required" | "pending" | "done";

export type InformationField = {
  id: string;
  label: string;
  requirement: string;
  type: string;
  optional?: boolean;
  options?: string[];
  responseType?: string | null;
  selectionMode?: "single" | "multiple" | null;
  detailsLabel?: string | null;
  actionUrl?: string | null;
  errors?: string[];
};

export type VerificationTask = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  details: string[];
  blocked: string[];
  resolve:
    | {
        kind: "session";
        kindHint: "business" | "individual";
        label: string;
      }
    | {
        kind: "form";
        verificationId: string;
        fields: InformationField[];
        label: string;
      }
    | { kind: "url"; url: string; embed: boolean; label: string }
    | { kind: "wait"; label: string };
};

export type RequiredActionInput = {
  action: string;
  title: string;
  description: string;
  status: string;
  cta: string | null;
  ctaLabel: string;
  blocked: string[];
};

export type InformationInput = InformationField & {
  verificationId: string;
};

export type DocumentInput = {
  id: string;
  document: string;
  status?: string;
  rejectionReason?: string | null;
  sessionUrl?: string | null;
};

const CATEGORY_ORDER: TaskCategory[] = ["kyc", "proof", "extra", "payout"];
const STATUS_ORDER: TaskStatus[] = ["required", "not_started", "pending", "done"];

export function categoryLabel(category: TaskCategory) {
  switch (category) {
    case "kyc":
      return "KYC";
    case "proof":
      return "Prova de vendas";
    case "payout":
      return "Saque";
    default:
      return "Adicional";
  }
}

export function capabilityLabel(value: string) {
  const known: Record<string, string> = {
    withdrawals: "saques",
    payouts: "saques",
    payments: "pagamentos",
    checkout: "checkout",
    standard_payout: "saque padrão",
    instant_payout: "saque instantâneo",
    crypto_payout: "saque em cripto",
    transfer: "transferência",
  };
  return known[value] ?? value.replaceAll("_", " ");
}

export function taskStatusLabel(status: TaskStatus) {
  switch (status) {
    case "done":
      return "Concluída";
    case "pending":
      return "Em análise";
    case "not_started":
      return "Não iniciado";
    default:
      return "Pendente";
  }
}

export function httpsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Painel da Whop exige login e, sem sessão, cai na página de marketing. */
export function isWhopDashboardUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/(^|\.)whop\.com$/i.test(url.hostname)) return false;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/pt") return true;
    return /\/dashboard(?:\/|$)|\/settings\/verifications|\/home$/.test(path);
  } catch {
    return false;
  }
}

function embeddable(url: string) {
  if (isWhopDashboardUrl(url)) return false;
  return /sumsub|verify-identity|identity|onboarding|kyc/i.test(url);
}

function categoryFromText(text: string): TaskCategory {
  const value = text.toLowerCase();
  if (
    /identit|kyc|liveness|selfie|passport|id_document|ssn|verify_identity|document_of_identity|prova de vida/.test(
      value,
    )
  ) {
    return "kyc";
  }
  if (
    /sale|sales|prova|processing_statement|invoice|volume|fulfillment|bank_statement|proof_of|comprovante|extrato|faturamento/.test(
      value,
    )
  ) {
    return "proof";
  }
  if (/payout|withdrawal|bank_account|pix|saque/.test(value)) return "payout";
  return "extra";
}

function answerHint(type: string) {
  switch (type) {
    case "files":
      return "Envie um ou mais arquivos (JPEG, PNG ou PDF).";
    case "id_document":
      return "Envie o documento de identidade nos lados pedidos.";
    case "liveness":
      return "Abra a prova de vida e confirme quando terminar.";
    case "address":
      return "Informe o endereço pedido.";
    case "text":
    case "date":
    case "phone":
    case "select":
    case "text_with_files":
      return "Responda o que a Whop pediu nesta tarefa.";
    default:
      return "Siga a instrução desta tarefa para concluir.";
  }
}

function requirementLabel(requirement: string) {
  const known: Record<string, string> = {
    identity_document: "Documento de identidade",
    ssn: "Identificação fiscal",
    liveness: "Prova de vida",
    bank_statement: "Extrato bancário",
    processing_statements: "Comprovante de vendas",
    proof_of_address: "Comprovante de endereço",
    proof_of_sales: "Prova de vendas",
  };
  return known[requirement] ?? requirement.replaceAll("_", " ");
}

function actionFallback(action: string) {
  const known: Record<string, { title: string; description: string; category: TaskCategory }> = {
    verify_identity: {
      title: "Verificação de identidade (KYC)",
      description: "A Whop confirma quem opera a conta antes de liberar saques.",
      category: "kyc",
    },
    submit_information_request: {
      title: "Informações do negócio",
      description:
        "A análise pediu dados atualizados do negócio. Preencha o formulário nesta página. Enquanto o pedido estiver aberto, os saques ficam pausados. As vendas continuam.",
      category: "extra",
    },
    update_payout_profile: {
      title: "Perfil de saque",
      description: "Complete os dados usados para enviar o dinheiro.",
      category: "payout",
    },
    reauthorize_payout_methods: {
      title: "Reautorizar método de saque",
      description: "O método de saque precisa ser confirmado de novo na Whop.",
      category: "payout",
    },
    accept_payout_terms: {
      title: "Termos de saque",
      description: "Aceite os termos de saque da Whop para receber.",
      category: "payout",
    },
    update_automatic_withdrawal_method: {
      title: "Método de saque automático",
      description: "Escolha para onde a Whop envia o saldo.",
      category: "payout",
    },
  };
  return (
    known[action] ?? {
      title: action.replaceAll("_", " "),
      description: "A Whop marcou esta etapa como necessária na conta.",
      category: categoryFromText(action),
    }
  );
}

function sessionResolve(
  kindHint: "business" | "individual",
  label: string,
): VerificationTask["resolve"] {
  return { kind: "session", kindHint, label };
}

function resolveAction(
  action: string,
  category: TaskCategory,
  cta: string | null,
  ctaLabel: string,
): VerificationTask["resolve"] {
  const url = httpsUrl(cta);
  const dashboard = Boolean(url && isWhopDashboardUrl(url));
  if (action === "submit_information_request") {
    return sessionResolve("business", "Adicionar informações");
  }
  if (action === "verify_identity" || category === "kyc") {
    return sessionResolve("individual", ctaLabel || "Resolver KYC");
  }
  if (category === "payout" && (!url || dashboard)) {
    return {
      kind: "url",
      url: "/painel/saldo",
      embed: false,
      label: "Resolver em Saldo e saques",
    };
  }
  if (url && !dashboard) {
    return {
      kind: "url",
      url,
      embed: embeddable(url),
      label: ctaLabel || "Resolver esta tarefa",
    };
  }
  return sessionResolve("business", ctaLabel || "Continuar verificação");
}

export function buildVerificationTasks(input: {
  kycStatus: string;
  requiredActions: RequiredActionInput[];
  information: InformationInput[];
  documents: DocumentInput[];
}) {
  const tasks: VerificationTask[] = [];
  const hasInformation = input.information.length > 0;

  for (const [index, action] of input.requiredActions.entries()) {
    if (action.action === "submit_information_request" && hasInformation) continue;
    const fallback = actionFallback(action.action);
    const category =
      action.action === "submit_information_request"
        ? fallback.category
        : action.title
          ? categoryFromText(`${action.action} ${action.title} ${action.description}`)
          : fallback.category;
    const status: TaskStatus = action.status === "pending" ? "pending" : "required";
    const genericRequest = action.action === "submit_information_request";
    tasks.push({
      id: `action-${action.action}-${index}`,
      title: genericRequest ? fallback.title : action.title.trim() || fallback.title,
      description: genericRequest
        ? fallback.description
        : action.description.trim() || fallback.description,
      category: action.action === "verify_identity" ? "kyc" : category,
      status,
      details: [],
      blocked: action.blocked,
      resolve: resolveAction(
        action.action,
        action.action === "verify_identity" ? "kyc" : category,
        action.cta,
        action.ctaLabel,
      ),
    });
  }

  const groups = new Map<string, InformationInput[]>();
  for (const item of input.information) {
    if (!item.verificationId) continue;
    const current = groups.get(item.verificationId) ?? [];
    current.push(item);
    groups.set(item.verificationId, current);
  }

  for (const [verificationId, items] of groups) {
    const text = items.map((item) => `${item.requirement} ${item.label} ${item.type}`).join(" ");
    const category = categoryFromText(text);
    const single = items.length === 1 ? items[0] : null;
    tasks.push({
      id: `info-${verificationId}`,
      title: single?.label.trim() || "Informações da análise",
      description: single?.optional
        ? "Este pedido é opcional. A resposta fica nesta página."
        : "Responda nesta página. O envio segue para a análise sem abrir a Whop.",
      category,
      status: "required",
      details: items.flatMap((item) =>
        [
          items.length > 1 ? item.label.trim() : `Pedido: ${requirementLabel(item.requirement)}`,
          answerHint(item.type),
          item.detailsLabel?.trim() || "",
          ...(item.errors ?? []).filter(Boolean).map((error) => `Recusado: ${error}`),
        ].filter(Boolean),
      ),
      blocked: [],
      resolve: {
        kind: "form",
        verificationId,
        label: "Enviar informações",
        fields: items.map((item) => ({
          id: item.id,
          label: item.label,
          requirement: item.requirement,
          type: item.type,
          optional: item.optional,
          options: item.options,
          responseType: item.responseType,
          selectionMode: item.selectionMode,
          detailsLabel: item.detailsLabel,
          actionUrl: httpsUrl(item.actionUrl),
          errors: item.errors,
        })),
      },
    });
  }

  for (const document of input.documents) {
    if (document.status === "submitted") continue;
    const url = httpsUrl(document.sessionUrl);
    tasks.push({
      id: `doc-${document.id}`,
      title: requirementLabel(document.document),
      description: "Documento ainda não enviado para a Whop.",
      category: categoryFromText(document.document),
      status: "required",
      details: document.rejectionReason ? [`Recusado: ${document.rejectionReason}`] : [],
      blocked: [],
      resolve:
        url && !isWhopDashboardUrl(url)
          ? { kind: "url", url, embed: embeddable(url), label: "Enviar documento" }
          : sessionResolve("individual", "Enviar na verificação"),
    });
  }

  const hasKyc = tasks.some((task) => task.category === "kyc");
  if (!hasKyc && input.kycStatus !== "verified") {
    tasks.unshift({
      id: "kyc",
      title: "Verificação de identidade (KYC)",
      description:
        input.kycStatus === "pending" || input.kycStatus === "action_required"
          ? "A Whop ainda está analisando a identidade, ou pediu um complemento."
          : "Ainda não iniciada. É a primeira etapa para a conta receber e sacar.",
      category: "kyc",
      status:
        input.kycStatus === "pending" || input.kycStatus === "action_required"
          ? "pending"
          : "not_started",
      details: [],
      blocked: ["Saques ficam bloqueados até a Whop aprovar a identidade."],
      resolve: sessionResolve("individual", "Resolver KYC"),
    });
  }

  if (input.kycStatus === "verified" && !tasks.some((task) => task.category === "kyc")) {
    tasks.push({
      id: "kyc-done",
      title: "Verificação de identidade (KYC)",
      description: "A Whop já aprovou esta etapa.",
      category: "kyc",
      status: "done",
      details: [],
      blocked: [],
      resolve: { kind: "wait", label: "Nada a resolver aqui." },
    });
  }

  return tasks.sort((a, b) => {
    const status = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (status !== 0) return status;
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}
