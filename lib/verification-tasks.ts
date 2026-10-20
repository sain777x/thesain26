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
  kind?: "individual" | "business" | null;
};

export type DocumentInput = {
  id: string;
  document: string;
  status?: string;
  rejectionReason?: string | null;
  sessionUrl?: string | null;
};

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
      return "Envie fotos, PDF ou um vídeo (MP4, MOV ou WEBM).";
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

  return tasks.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
}

const IDENTITY_STATUS_RANK = [
  "action_required",
  "rejected",
  "pending",
  "processing",
  "manual_review",
  "not_started",
  "approved",
];

export type IdentityLane = {
  kind: "individual" | "business";
  title: string;
  status: string;
  forms: VerificationTask[];
};

export type CapabilityRow = {
  id: string;
  label: string;
  hint: string;
};

export type VerificationDesk = {
  businessReview: {
    open: boolean;
    pendingReview: boolean;
    affectsWithdrawals: boolean;
    title: string;
    description: string;
    profile: {
      description: string;
      socialUrl: string;
      askDescription: boolean;
      askSocial: boolean;
      descriptionRequired: boolean;
      socialRequired: boolean;
      askTax: boolean;
      taxHandling: "whop" | "self" | "none" | null;
    };
    tasks: VerificationTask[];
  };
  identity: IdentityLane[];
  capabilities: CapabilityRow[];
  extras: VerificationTask[];
};

export function isIdentityInformation(item: { requirement: string; label: string; type: string }) {
  if (item.type === "liveness" || item.type === "id_document") return true;
  return categoryFromText(`${item.requirement} ${item.label} ${item.type}`) === "kyc";
}

export function isDescriptionRequest(item: { requirement: string; label: string }) {
  return /descri|about|sobre/.test(`${item.requirement} ${item.label}`.toLowerCase());
}

export function isSocialRequest(item: {
  requirement: string;
  label: string;
  type?: string;
  responseType?: string | null;
}) {
  if (item.responseType === "url" || item.type === "url") return true;
  const requirement = item.requirement.toLowerCase();
  const label = item.label.toLowerCase();
  return /social|website|perfil|rede/.test(requirement) || /rede social|perfil|website|site ou/.test(label);
}

/** Id sintético. No envio ele é trocado pelo `inrqi_` real de proof_of_fulfillment. */
export const PROOF_FIELD_ID = "proof_of_fulfillment";

export function normalizeInformationType(item: {
  type?: string | null;
  requirement?: string | null;
  supportingFilesRequired?: boolean;
}) {
  const type = (item.type ?? "").toLowerCase();
  const requirement = (item.requirement ?? "").toLowerCase();
  if (item.supportingFilesRequired && (type === "text" || type === "")) return "text_with_files";
  if (type === "file" || type === "document" || type === "documents") return "files";
  if (requirement === "proof_of_fulfillment" && type !== "text" && type !== "text_with_files") {
    return "files";
  }
  return item.type || "text";
}

export function isUploadField(field: { type: string }) {
  return (
    field.type === "files" ||
    field.type === "file" ||
    field.type === "document" ||
    field.type === "documents" ||
    field.type === "text_with_files"
  );
}

function latestStatus(statuses: string[]) {
  const ranked = [...statuses].sort(
    (left, right) => IDENTITY_STATUS_RANK.indexOf(left) - IDENTITY_STATUS_RANK.indexOf(right),
  );
  return ranked.find((status) => IDENTITY_STATUS_RANK.includes(status)) ?? statuses[0] ?? "not_started";
}

function capabilityHint(state: string | null | undefined, locked: string) {
  if (state === "active") return "Liberado";
  if (state === "pending") return "Em análise";
  return locked;
}

/** Painel de verificações no formato da Whop: análise do negócio e identidade ficam independentes. */
export function buildVerificationDesk(input: {
  description: string;
  socialUrl: string;
  actions: RequiredActionInput[];
  information: InformationInput[];
  verifications: { kind?: string | null; status?: string | null }[];
  openVerificationId?: string;
  taxRemittedBy?: "whop" | "self" | "none" | null;
  capabilities: {
    standardPayout?: string | null;
    cardIssuing?: string | null;
    bankDeposit?: string | null;
    financing?: string | null;
  };
}): VerificationDesk {
  const businessItems = input.information.filter((item) => !isIdentityInformation(item));
  const identityItems = input.information.filter((item) => isIdentityInformation(item));
  const businessTasks = buildVerificationTasks({
    kycStatus: "verified",
    requiredActions: [],
    information: businessItems,
    documents: [],
  }).filter((task) => task.id !== "kyc-done");
  const identityTasks = buildVerificationTasks({
    kycStatus: "verified",
    requiredActions: [],
    information: identityItems,
    documents: [],
  }).filter((task) => task.id !== "kyc-done");

  const review = input.actions.find((action) => action.action === "submit_information_request");
  const tasks = [...businessTasks];

  const lanes: IdentityLane[] = (
    [
      { kind: "individual", title: "Verificação individual" },
      { kind: "business", title: "Verificação empresarial" },
    ] as const
  ).map((lane) => ({
    ...lane,
    status: latestStatus(
      input.verifications
        .filter((item) => item.kind === lane.kind)
        .map((item) => item.status || "not_started"),
    ),
    forms: identityTasks.filter((task) =>
      input.information.some(
        (item) => item.verificationId && task.id === `info-${item.verificationId}` && item.kind === lane.kind,
      ),
    ),
  }));

  const hasBusinessForm = tasks.some((task) => task.resolve.kind === "form");
  if (review && !hasBusinessForm) {
    const reviewUrl = httpsUrl(review.cta);
    tasks.push({
      id: "business-review-rfi",
      title: "Informações atualizadas do negócio",
      description:
        "A Whop pediu informações atualizadas do negócio. Preencha no formulário abaixo, já autenticado — sem login no painel da Whop. Os saques voltam depois da análise (geralmente menos de 24h). As vendas continuam.",
      category: "extra",
      status: review.status === "pending" ? "pending" : "required",
      details: ["Responda só os campos que a Whop devolveu nesta leitura."],
      blocked: review.blocked,
      resolve: reviewUrl
        ? { kind: "url", url: reviewUrl, embed: false, label: "Responder na Whop" }
        : { kind: "url", url: "/painel/verificacoes", embed: false, label: "Atualizar" },
    });
  }

  return {
    businessReview: {
      open: Boolean(review) || tasks.length > 0,
      pendingReview: review?.status === "pending" && businessTasks.length === 0,
      affectsWithdrawals: Boolean(review),
      title: "Análise do negócio",
      description: hasBusinessForm
        ? "A Whop está pedindo só o que está neste formulário, lido agora. Não envie prova, imposto ou outro campo que não apareça aqui."
        : review
          ? "A Whop pediu informações atualizadas do negócio. Responda no formulário abaixo, sem sair da thesain26."
          : "A análise segue pendente, mas a Whop ainda não devolveu as perguntas. Atualize a página para ler o pedido de novo.",
      profile: {
        description: input.description,
        socialUrl: input.socialUrl,
        askDescription: false,
        askSocial: false,
        descriptionRequired: false,
        socialRequired: false,
        askTax: false,
        taxHandling: input.taxRemittedBy ?? null,
      },
      tasks,
    },
    identity: lanes,
    capabilities: [
      {
        id: "payouts",
        label: "Saques",
        hint: capabilityHint(input.capabilities.standardPayout, "Verificar identidade para liberar"),
      },
      {
        id: "card",
        label: "Cartão Whop",
        hint: capabilityHint(input.capabilities.cardIssuing, "Verificar identidade para liberar"),
      },
      {
        id: "bank",
        label: "Depósitos bancários",
        hint: capabilityHint(input.capabilities.bankDeposit, "Verificar identidade para liberar"),
      },
      {
        id: "financing",
        label: "Financiamento",
        hint: capabilityHint(input.capabilities.financing, "Solicitar financiamento para liberar"),
      },
    ],
    extras: input.actions
      .filter((action) => action.action !== "verify_identity" && action.action !== "submit_information_request")
      .map((action, index) => {
        const fallback = actionFallback(action.action);
        return {
          id: `extra-${action.action}-${index}`,
          title: action.title.trim() || fallback.title,
          description: action.description.trim() || fallback.description,
          category: fallback.category,
          status: action.status === "pending" ? "pending" : "required",
          details: [],
          blocked: action.blocked,
          resolve: resolveAction(action.action, fallback.category, action.cta, action.ctaLabel),
        } satisfies VerificationTask;
      }),
  };
}
