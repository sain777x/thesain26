/**
 * Tarefas de verificação no formato da Whop: cada item é uma pendência
 * separada (KYC, prova de vendas, documento extra) e o vendedor escolhe
 * qual abrir primeiro. Os títulos vêm da API; esta função só organiza.
 */

export type TaskCategory = "kyc" | "proof" | "payout" | "extra";
export type TaskStatus = "not_started" | "required" | "pending" | "done";

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
        kind: "account_link";
        useCase: "account_onboarding" | "payouts_portal";
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

export type InformationInput = {
  id: string;
  label: string;
  requirement: string;
  type: string;
  actionUrl?: string | null;
  optional?: boolean;
  errors?: string[];
  detailsLabel?: string;
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

function embeddable(url: string) {
  return /sumsub|verif|identity|onboarding|kyc/i.test(url);
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
      return "A Whop espera um arquivo.";
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
      title: "Informação adicional",
      description:
        "A Whop pediu um documento ou uma resposta. Pode ser prova de vendas, extrato ou outro comprovante.",
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

function resolveAction(
  action: string,
  category: TaskCategory,
  cta: string | null,
  ctaLabel: string,
): VerificationTask["resolve"] {
  const url = httpsUrl(cta);
  if (action === "verify_identity" || (category === "kyc" && !url)) {
    return {
      kind: "account_link",
      useCase: "account_onboarding",
      label: ctaLabel || "Resolver KYC",
    };
  }
  if (category === "payout" && !url) {
    return {
      kind: "account_link",
      useCase: "payouts_portal",
      label: ctaLabel || "Abrir saques",
    };
  }
  if (url) {
    return {
      kind: "url",
      url,
      embed: embeddable(url),
      label: ctaLabel || "Resolver esta tarefa",
    };
  }
  return {
    kind: "account_link",
    useCase: category === "payout" ? "payouts_portal" : "account_onboarding",
    label: ctaLabel || "Abrir na Whop",
  };
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
    const category = action.title
      ? categoryFromText(`${action.action} ${action.title} ${action.description}`)
      : fallback.category;
    const status: TaskStatus = action.status === "pending" ? "pending" : "required";
    tasks.push({
      id: `action-${action.action}-${index}`,
      title: action.title.trim() || fallback.title,
      description: action.description.trim() || fallback.description,
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

  for (const item of input.information) {
    const category = categoryFromText(`${item.requirement} ${item.label} ${item.type}`);
    const url = httpsUrl(item.actionUrl);
    const errors = (item.errors ?? []).filter(Boolean);
    tasks.push({
      id: `info-${item.id}`,
      title: item.label.trim() || requirementLabel(item.requirement),
      description: item.optional
        ? "A Whop marcou este pedido como opcional."
        : "A Whop pediu esta informação antes de seguir com a conta.",
      category,
      status: "required",
      details: [
        `Pedido: ${requirementLabel(item.requirement)}`,
        answerHint(item.type),
        item.detailsLabel?.trim() || "",
        ...errors.map((error) => `Recusado: ${error}`),
      ].filter(Boolean),
      blocked: [],
      resolve: url
        ? {
            kind: "url",
            url,
            embed: embeddable(url) || item.type === "liveness",
            label: "Resolver esta tarefa",
          }
        : category === "payout"
          ? { kind: "account_link", useCase: "payouts_portal", label: "Resolver no portal de saques" }
          : { kind: "account_link", useCase: "account_onboarding", label: "Resolver na verificação" },
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
      resolve: url
        ? { kind: "url", url, embed: true, label: "Enviar documento" }
        : { kind: "account_link", useCase: "account_onboarding", label: "Enviar na verificação" },
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
      resolve: {
        kind: "account_link",
        useCase: "account_onboarding",
        label: "Resolver KYC",
      },
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
