import { prisma } from "@/lib/prisma";
import { WhopClient, type Whop } from "@whop/sdk";
import {
  buildSocialLinks,
  normalizeHttpUrl,
  socialPlatform,
  toWhopClassification,
} from "@/lib/business";
import { applicationFeeAmount } from "@/lib/money";
import {
  buildVerificationDesk,
  isDescriptionRequest,
  isSocialRequest,
  normalizeInformationType,
  type InformationInput,
  type VerificationDesk,
} from "@/lib/verification-tasks";

/**
 * Cliente oficial da Whop.
 *
 * A thesain26 opera no modelo de Direct Charges: cada vendedor é uma
 * Connected Account (biz_...) sob a Account API key da plataforma. A cobrança
 * nasce na conta do vendedor e a thesain26 fica com `application_fee_amount`.
 */
async function keyFor(accountId: string, apiKey?: string | null) {
  if (apiKey) return apiKey;
  const user = await prisma.user.findFirst({
    where: { whopBizId: accountId },
    select: { whopApiKey: true },
  });
  return user?.whopApiKey;
}

export function getWhop(apiKey?: string | null) {
  if (!apiKey) {
    throw new Error("Key da conta não configurada.");
  }
  return new WhopClient({ token: apiKey });
}

export function whopErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Não foi possível falar com a Whop.";
  }
  const record = error as {
    message?: string;
    body?: unknown;
    statusCode?: number;
  };
  const body = record.body;
  if (body && typeof body === "object") {
    const parsed = body as {
      error?: { message?: string };
      message?: string;
    };
    if (parsed.error?.message) return parsed.error.message;
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message;
    }
  }
  if (record.message) return record.message;
  return "A Whop recusou a operação.";
}

/**
 * Cria a Connected Account do vendedor. A Whop trata email + external_id como
 * chave idempotente: repetir o cadastro devolve a mesma conta em vez de duplicar.
 */
export async function createConnectedAccount(params: {
  email: string;
  title: string;
  externalId: string;
  country?: string | null;
  website?: string | null;
  apiKey?: string | null;
}) {
  const client = getWhop(params.apiKey);
  // accounts.create é idempotente em email + metadata.external_id.
  // País e site já entram aqui; tipo de negócio e descrição vão no update,
  // porque o create da Whop não aceita business_type nem description.
  const account = await client.accounts.create({
    email: params.email,
    title: params.title,
    country: params.country || undefined,
    website: params.website || undefined,
    dispute_fighter_enabled: true,
    send_customer_emails: true,
    metadata: {
      external_id: params.externalId,
      platform: "thesain26",
    },
  } as Parameters<typeof client.accounts.create>[0]);
  if (!account.id) {
    throw new Error("A Whop não devolveu o id da connected account.");
  }
  return account.id;
}

export type CompanyProfileInput = {
  title: string;
  businessName: string;
  description: string;
  country: string;
  website?: string | null;
  socialUrl?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
  businessType: string;
  industryType: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostalCode?: string | null;
};

/** A Whop exige o número no começo da linha. "Cortlandt Street, 581" vira "581 Cortlandt Street". */
export function streetLineForWhop(line1: string) {
  const value = line1.trim().replace(/\s+/g, " ");
  if (!value || /^\d/.test(value)) return value;
  const match = value.match(/^(.*?)(?:,\s*|\s+)(\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?)\.?$/);
  if (!match) return value;
  const street = match[1].replace(/,\s*$/, "").trim();
  if (!street || /^\d/.test(street)) return value;
  return `${match[2]} ${street}`;
}

/**
 * Envia o perfil da empresa para a Connected Account.
 * O mapa de business_type / industry_group / industry_type está em lib/business.ts.
 * Não reenviamos metadata aqui para não apagar o external_id gravado no create.
 */
export async function syncCompanyProfile(accountId: string, input: CompanyProfileInput) {
  const user = await prisma.user.findFirst({ where: { whopBizId: accountId }, select: { whopApiKey: true } });
  const client = getWhop(user?.whopApiKey);
  const classification = toWhopClassification(input.businessType, input.industryType);
  const businessAddress = input.addressLine1
    ? {
        line1: streetLineForWhop(input.addressLine1),
        line2: input.addressLine2 || null,
        city: input.addressCity || null,
        state: input.addressState || null,
        postal_code: input.addressPostalCode || null,
        country: input.country.toUpperCase(),
      }
    : undefined;
  const website = normalizeHttpUrl(input.website);
  const socialLinks = buildSocialLinks({
    website,
    socialUrl: normalizeHttpUrl(input.socialUrl),
    instagram: normalizeHttpUrl(input.instagram),
    youtube: normalizeHttpUrl(input.youtube),
    linkedin: normalizeHttpUrl(input.linkedin),
  });

  await client.accounts.update({
    id: accountId,
    title: input.title,
    business_name: input.businessName,
    description: input.description.trim().slice(0, 400) || null,
    country: input.country || null,
    website,
    business_type: classification.business_type,
    industry_group: classification.industry_group,
    industry_type: classification.industry_type,
    other_business_description: classification.otherBusiness ?? null,
    other_industry_description: classification.otherIndustry ?? null,
    social_links: socialLinks,
    // Perfil completo: sai do None e fica mais segura na Whop.
    onboarding_type: "seller",
    three_ds_level: "frictionless_if_required",
    dispute_fighter_enabled: true,
    // Imposto: opção 2 da tela ("Whop collects and remits tax").
    tax_remitted_by: "whop",
    tax_type: "exclusive",
    ...(businessAddress ? { business_address: businessAddress } : {}),
  } as Parameters<typeof client.accounts.update>[0]);
}

/** status da conta na Whop: active ou suspended. */
export async function syncOperatingStatus(
  accountId: string,
  apiKey?: string | null,
): Promise<"active" | "suspended"> {
  const client = getWhop(await keyFor(accountId, apiKey));
  const account = await client.accounts.retrieve({ id: accountId });
  return account.status === "suspended" ? "suspended" : "active";
}

export type AccountLinkUseCase = "account_onboarding" | "payouts_portal";

/**
 * Account Link oficial.
 * - account_onboarding: KYC / verificação de identidade
 * - payouts_portal: saldo, métodos de saque e KYC no portal hospedado
 *
 * O SDK atual pede `account_id` (o biz_ da connected account). Nas docs mais
 * antigas esse campo aparecia como `company_id`.
 */
export async function createAccountLink(params: {
  accountId: string;
  useCase: AccountLinkUseCase;
  returnUrl: string;
  refreshUrl: string;
}) {
  const user = await prisma.user.findFirst({ where: { whopBizId: params.accountId }, select: { whopApiKey: true } });
  const client = getWhop(user?.whopApiKey);
  const link = await client.accountLinks.create({
    account_id: params.accountId,
    use_case: params.useCase,
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
  });
  if (!link.url) {
    throw new Error("A Whop não devolveu a URL do account link.");
  }
  return link.url;
}

/**
 * Link secundário para a aba Verificações da Whop. Não é o caminho principal:
 * essa URL exige login no painel da Whop e, sem sessão, cai em `/?next=...`.
 * A resposta do pedido fica no formulário local, via PATCH /verifications.
 */
export async function businessReviewPortalUrl(accountId: string, _origin?: string) {
  try {
    const user = await prisma.user.findFirst({ where: { whopBizId: accountId }, select: { whopApiKey: true } });
    const account = await getWhop(user?.whopApiKey).accounts.retrieve({ id: accountId });
    const action = account.required_actions?.find(
      (item) => item.action === "submit_information_request" && item.cta,
    );
    if (action?.cta) return action.cta;
  } catch {
    // A URL da aba continua válida mesmo se a leitura da conta falhar.
  }
  return `https://whop.com/dashboard/${accountId}/settings/verifications/`;
}

/**
 * Abre a verificação certa para o botão escolhido.
 * Individual continua no account link de identidade.
 * Empresarial cria (ou reabre) a verificação kind=business e usa o session_url dela.
 * O account link de onboarding ignora o tipo e sempre cai no KYC da pessoa.
 */
export async function openVerificationSession(params: {
  accountId: string;
  kind: "business" | "individual";
  returnUrl: string;
  refreshUrl: string;
}) {
  if (params.kind !== "business") {
    return createAccountLink({
      accountId: params.accountId,
      useCase: "account_onboarding",
      returnUrl: params.returnUrl,
      refreshUrl: params.refreshUrl,
    });
  }

  const client = getWhop(await keyFor(params.accountId));
  const list = await client.verifications.list({ account_id: params.accountId });
  const current = (list.data ?? []).find((item) => item.kind === "business" && item.status !== "approved");
  if (current?.session_url) return current.session_url;
  if (current?.id) {
    try {
      const full = await client.verifications.retrieve({ id: current.id });
      if (full.session_url) return full.session_url;
    } catch (error) {
      console.error("[thesain26] verifications.retrieve business", whopErrorMessage(error));
    }
  }

  const account = await client.accounts.retrieve({ id: params.accountId });
  const raw = account.business_address;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const country = text(account.country)?.toUpperCase() || text(raw?.country)?.toUpperCase();
  const line1 = raw && text(raw.line1) ? streetLineForWhop(text(raw.line1) as string) : null;
  const address = raw
    ? {
        line1,
        line2: text(raw.line2) ?? null,
        city: text(raw.city) ?? null,
        state: text(raw.state) ?? null,
        postal_code: text(raw.postal_code) ?? null,
        country: text(raw.country)?.toUpperCase() || country || null,
      }
    : undefined;
  if (raw && address?.line1 && address.line1 !== text(raw.line1)) {
    await client.accounts.update({
      id: params.accountId,
      business_address: address,
    } as Parameters<typeof client.accounts.update>[0]);
  }
  const created = await client.verifications.create({
    account_id: params.accountId,
    body: {
      kind: "business",
      business_name: text(account.business_name) || text(account.title),
      country,
      address,
    },
  });
  if (created.session_url) return created.session_url;
  throw new Error("A Whop não abriu a verificação empresarial.");
}

type DirectChargeInput = {
  accountId: string;
  price: number;
  currency?: string;
  feePercent: number;
  title: string;
  description?: string;
  metadata: Record<string, string>;
  redirectUrl?: string;
  planId?: string | null;
  /** prod_ do produto cujo título e rótulo o checkout mostra. */
  whopProductId?: string | null;
};

/** A variante da Whop só aceita 30 caracteres. O nome visível fica no produto, até 80. */
const VARIANT_TITLE_MAX = 30;

function variantTitle(value: string) {
  const title = value.trim().slice(0, VARIANT_TITLE_MAX);
  return title || "Produto";
}

export type DirectChargeResult = {
  sessionId: string;
  planId: string | null;
  purchaseUrl: string | null;
  applicationFeeAmount: number;
};

/**
 * Checkout Configuration de Direct Charge.
 *
 * `account_id` é a connected account do vendedor: o dinheiro cai lá.
 * `plan.application_fee_amount` é a comissão da thesain26, em dólares.
 * O tipo gerado do SDK ainda não lista esse campo no plan do checkout, mas a
 * API de plataformas documenta e aceita. Por isso o objeto é enviado com o
 * campo extra.
 *
 * Sem `planId`, criamos a variante (plan) junto com a configuração.
 * Com `planId`, abrimos só uma sessão nova em cima da variante já criada.
 */
export async function createDirectChargeCheckout(
  input: DirectChargeInput,
): Promise<DirectChargeResult> {
  const user = await prisma.user.findFirst({ where: { whopBizId: input.accountId }, select: { whopApiKey: true } });
  const client = getWhop(user?.whopApiKey);
  const fee = applicationFeeAmount(input.price, input.feePercent);
  const redirect =
    input.redirectUrl && input.redirectUrl.startsWith("https://")
      ? input.redirectUrl
      : undefined;

  const request: Whop.CreateCheckoutConfigurationsRequest = input.planId
    ? {
        account_id: input.accountId,
        mode: "payment",
        plan_id: input.planId,
        metadata: input.metadata,
        redirect_url: redirect,
      }
    : {
        account_id: input.accountId,
        mode: "payment",
        metadata: input.metadata,
        redirect_url: redirect,
        plan: {
          account_id: input.accountId,
          currency: (input.currency || "usd").toLowerCase(),
          plan_type: "one_time",
          initial_price: input.price,
          product_id: input.whopProductId || undefined,
          title: variantTitle(input.title),
          description: input.description?.trim().slice(0, 1000) || null,
          force_create_new_plan: true,
          visibility: "visible",
          metadata: input.metadata,
          application_fee_amount: fee,
        } as Whop.CreateCheckoutConfigurationsRequest.Plan,
      };

  const configuration = await client.checkoutConfigurations.create(request);
  const plan = configuration.plan as
    | (typeof configuration.plan & { purchase_url?: string | null })
    | null
    | undefined;

  return {
    sessionId: configuration.id,
    planId: plan?.id ?? input.planId ?? null,
    purchaseUrl: configuration.purchase_url ?? plan?.purchase_url ?? null,
    applicationFeeAmount: fee,
  };
}

/**
 * Produto da Whop que o checkout usa como nome.
 * `title` aceita 80 caracteres. `headline` é o rótulo, também até 80.
 * Sem este produto, a página mostra o nome da empresa.
 */
export async function syncCheckoutProduct(input: {
  accountId: string;
  whopProductId?: string | null;
  name: string;
  subtitle?: string;
  description?: string;
}) {
  const user = await prisma.user.findFirst({ where: { whopBizId: input.accountId }, select: { whopApiKey: true } });
  const apiKey = user?.whopApiKey;
  const client = getWhop(await keyFor(input.accountId, apiKey));
  const title = input.name.trim().slice(0, 80);
  if (title.length < 2) {
    throw new Error("O nome do produto precisa ter pelo menos 2 caracteres.");
  }
  const headline = input.subtitle?.trim().slice(0, 80) || null;
  const description = input.description?.trim().slice(0, 1500) || null;
  if (input.whopProductId) {
    await client.products.update({
      id: input.whopProductId,
      title,
      headline,
      description,
      visibility: "visible",
    });
    return input.whopProductId;
  }
  const created = await client.products.create({
    account_id: input.accountId,
    title,
    headline,
    description,
    visibility: "visible",
  });
  if (!created.id) {
    throw new Error("A Whop não devolveu o produto.");
  }
  return created.id;
}

export type KycSnapshot = {
  status: "not_started" | "pending" | "verified" | "action_required" | "rejected";
  detail: string;
  /** session_url da Whop (fluxo Sumsub) quando a verificação devolve um link. */
  sessionUrl: string | null;
};

function mapVerificationStatus(status: string | undefined): KycSnapshot["status"] {
  switch (status) {
    case "approved":
    case "verified":
    case "connected":
      return "verified";
    case "action_required":
    case "resubmission_requested":
      return "action_required";
    case "rejected":
    case "declined":
    case "denied":
    case "verification_failed":
    case "canceled":
    case "expired":
    case "abandoned":
    case "disabled":
    case "blocked_by_parent":
      return "rejected";
    case "pending":
    case "processing":
    case "submitted":
    case "started":
    case "created":
    case "requires_input":
    case "pending_verification":
    case "manual_review":
    case "review":
      return "pending";
    default:
      return "not_started";
  }
}

/**
 * Lê o status real de verificação na Whop depois que o vendedor volta do
 * Account Link. Primeiro a lista de verifications; se ela vier vazia, o
 * status calculado da payout account no ledger.
 */
export async function requireVerifiedSeller(
  accountId: string,
  amountUsd: number,
  capUsd = 2400,
): Promise<void> {
  const kyc = await syncKycStatus(accountId, await keyFor(accountId));
  if (kyc.status === "verified") return;
  if (amountUsd <= capUsd) return; // deixa vender até US$2400 até o KYC aprovar
  throw new Error("Conclua a verificação da loja para vender acima do limite.");
}

export async function syncKycStatus(accountId: string, apiKey?: string | null): Promise<KycSnapshot> {
  const client = getWhop(await keyFor(accountId, apiKey));

  try {
    const list = await client.verifications.list({ account_id: accountId });
    const items = [...(list.data ?? [])].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    );
    const latest = items[0];
    if (latest?.status) {
      const actionUrl = latest.requested_information?.find((item) => item.action_url)
        ?.action_url;
      return {
        status: mapVerificationStatus(latest.status),
        detail: latest.status,
        sessionUrl: latest.session_url || actionUrl || null,
      };
    }
  } catch (error) {
    console.error("[thesain26] verifications.list", whopErrorMessage(error));
  }

  try {
    const ledger = await client.ledgerAccounts.retrieve({ id: accountId });
    const payoutStatus = ledger.payout_account_details?.status;
    if (payoutStatus) {
      return {
        status: mapVerificationStatus(payoutStatus),
        detail: payoutStatus,
        sessionUrl: null,
      };
    }
  } catch (error) {
    console.error("[thesain26] ledgerAccounts.retrieve", whopErrorMessage(error));
  }

  return { status: "not_started", detail: "not_started", sessionUrl: null };
}

/**
 * Painel de verificações: análise do negócio e identidade abrem separadas.
 * O formulário do negócio mostra só o `requested_information` aberto agora.
 */
export async function loadVerificationDesk(accountId: string, apiKey?: string | null): Promise<VerificationDesk> {
  const client = getWhop(await keyFor(accountId, apiKey));
  const [accountResult, verificationsResult] = await Promise.allSettled([
    client.accounts.retrieve({ id: accountId }),
    client.verifications.list({ account_id: accountId }),
  ]);

  if (accountResult.status === "rejected") {
    if (verificationsResult.status === "rejected") throw verificationsResult.reason;
    console.error("[thesain26] accounts.retrieve", whopErrorMessage(accountResult.reason));
  }
  if (verificationsResult.status === "rejected") {
    console.error("[thesain26] verifications.list", whopErrorMessage(verificationsResult.reason));
  }

  const account = accountResult.status === "fulfilled" ? accountResult.value : null;
  const information: InformationInput[] = [];
  const verifications: { kind?: string | null; status?: string | null }[] = [];
  let openVerificationId = "";

  if (verificationsResult.status === "fulfilled") {
    const rows = await Promise.all(
      (verificationsResult.value.data ?? []).map(async (verification) => {
        if (!verification.id || verification.status === "approved") return verification;
        try {
          const full = await client.verifications.retrieve({ id: verification.id });
          if ((full.requested_information?.length ?? 0) >= (verification.requested_information?.length ?? 0)) {
            return full;
          }
        } catch (error) {
          console.error("[thesain26] verifications.retrieve", whopErrorMessage(error));
        }
        return verification;
      }),
    );

    for (const verification of rows) {
      verifications.push({ kind: verification.kind, status: verification.status });
      if (verification.status === "approved" || !verification.id) continue;
      const kind = verification.kind === "business" ? "business" : "individual";
      for (const item of verification.requested_information ?? []) {
        const raw = item as typeof item & { field?: string | null; error_message?: string | null };
        const requirement = item.requirement || raw.field || "";
        const reasons = (item.errors ?? [])
          .map((error) => error.reason || error.code || "")
          .filter(Boolean);
        if (reasons.length === 0 && raw.error_message?.trim()) reasons.push(raw.error_message.trim());
        information.push({
          id: item.id,
          verificationId: verification.id,
          kind,
          label: item.label,
          requirement,
          type: normalizeInformationType({
            type: item.type,
            requirement,
            supportingFilesRequired: item.supporting_files_required,
          }),
          actionUrl: item.action_url,
          optional: item.optional,
          options: item.options,
          responseType: item.response_type,
          selectionMode: item.selection_mode,
          detailsLabel: item.details_label,
          errors: reasons,
        });
      }
    }

    openVerificationId =
      information.find((item) => item.type === "files" || item.requirement === "proof_of_fulfillment")
        ?.verificationId ||
      information[0]?.verificationId ||
      rows.find((item) => item.status === "action_required" && item.id)?.id ||
      "";
  }

  const social =
    account?.social_links?.find((link) => link.website !== "website")?.url ||
    account?.website ||
    account?.social_links?.[0]?.url ||
    "";

  return buildVerificationDesk({
    description: account?.description ?? "",
    socialUrl: social,
    actions: (account?.required_actions ?? []).map((action) => ({
      action: action.action,
      title: action.title,
      description: action.description,
      status: action.status,
      cta: action.cta,
      ctaLabel: action.cta_label,
      blocked: action.blocked_capabilities ?? [],
    })),
    information,
    verifications,
    openVerificationId,
    taxRemittedBy: account?.tax_remitted_by ?? null,
    capabilities: {
      standardPayout: account?.capabilities?.standard_payout,
      cardIssuing: account?.capabilities?.card_issuing,
      bankDeposit: account?.capabilities?.bank_deposit,
      financing: account?.capabilities?.accept_bnpl_payments,
    },
  });
}

/** Grava descrição e perfil/site pedidos na análise do negócio. */
export async function saveBusinessPresence(
  accountId: string,
  input: { description?: string; socialUrl?: string; taxRemittedBy?: "whop" | "self" | "none" },
  apiKey?: string | null,
) {
  const client = getWhop(await keyFor(accountId, apiKey));
  const description = input.description?.trim();
  const socialUrl = input.socialUrl?.trim() ? normalizeHttpUrl(input.socialUrl) : null;
  if (input.socialUrl?.trim() && !socialUrl) {
    throw new Error("Informe um site ou perfil com um endereço válido.");
  }
  if (!description && !socialUrl && !input.taxRemittedBy) return;

  const account = await client.accounts.retrieve({ id: accountId });
  const existing = (account.social_links ?? []).map((link) => ({
    url: link.url,
    website: link.website,
    title: link.title || link.website,
  }));
  const socialLinks = [...existing];
  if (socialUrl) {
    for (const link of buildSocialLinks({ socialUrl })) {
      if (!socialLinks.some((item) => item.url === link.url)) socialLinks.push(link);
    }
  }

  await client.accounts.update({
    id: accountId,
    ...(description ? { description: description.slice(0, 1000) } : {}),
    ...(socialUrl && socialPlatform(socialUrl) === "website" ? { website: socialUrl } : {}),
    ...(socialUrl ? { social_links: socialLinks } : {}),
    ...(input.taxRemittedBy ? { tax_remitted_by: input.taxRemittedBy } : {}),
  });
}

export function presenceFromAnswers(
  items: { id: string; requirement: string; label: string; type: string; responseType?: string | null }[],
  answers: { id: string; value?: string }[],
) {
  let description = "";
  let socialUrl = "";
  for (const answer of answers) {
    const item = items.find((entry) => entry.id === answer.id);
    const value = answer.value?.trim() ?? "";
    if (!item || !value) continue;
    if (!description && isDescriptionRequest(item)) description = value;
    if (!socialUrl && isSocialRequest(item)) socialUrl = value;
  }
  return { description, socialUrl };
}

export type BalanceSnapshot = {
  currency: string;
  available: number;
  pending: number;
  reserve: number;
};

/** Saldo da connected account. O id pode ser o próprio biz_. */
export async function getAccountBalance(accountId: string, apiKey?: string | null): Promise<BalanceSnapshot> {
  const client = getWhop(await keyFor(accountId, apiKey));
  const ledger = await client.ledgerAccounts.retrieve({ id: accountId });
  const usd =
    ledger.balances.find((item) => item.currency === "usd") ?? ledger.balances[0];
  return {
    currency: usd?.currency ?? "usd",
    available: usd?.balance ?? 0,
    pending: usd?.pending_balance ?? 0,
    reserve: usd?.reserve_balance ?? 0,
  };
}

/**
 * Token curto para os Whop Elements.
 * Sem escopo, herda a chave da plataforma (carteira).
 * Com escopo, vale só o que a lista pede (pendências de identidade).
 */
export async function createElementsToken(accountId: string, scopedActions?: string[], apiKey?: string | null) {
  const client = getWhop(await keyFor(accountId, apiKey));
  const access = await client.accessTokens.create({
    account_id: accountId,
    ...(scopedActions?.length ? { scoped_actions: scopedActions } : {}),
  });
  if (!access.token) {
    throw new Error("A Whop não devolveu o access token.");
  }
  return access.token;
}

export async function listAccountPayments(accountId: string, apiKey?: string | null) {
  const client = getWhop(await keyFor(accountId, apiKey));
  const page = await client.payments.list({
    account_id: accountId,
    first: 50,
    direction: "desc",
  });
  return page.data;
}

export type PayoutRow = {
  id: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  status: string;
  createdAt: string;
  destination: string | null;
  arrival: string | null;
  failure: string | null;
};

/** Histórico de saques da connected account (GET /payouts). */
export async function listPayoutHistory(accountId: string, apiKey?: string | null): Promise<PayoutRow[]> {
  const client = getWhop(await keyFor(accountId, apiKey));
  const page = await client.payouts.list({
    account_id: accountId,
    first: 20,
  });
  return page.data.map((item) => ({
    id: item.id,
    amount: Number(item.amount) || 0,
    fee: Number(item.fee_amount) || 0,
    net: Number(item.net_amount) || 0,
    currency: item.currency || "usd",
    status: item.status,
    createdAt: item.created_at,
    destination:
      item.payout_method?.nickname ||
      item.payout_method?.supported_payout_method?.payer_name ||
      item.payer_name ||
      null,
    arrival: item.estimated_arrival,
    failure: item.failure?.message ?? null,
  }));
}

export type PayoutMethodRow = {
  id: string;
  nickname: string | null;
  payerName: string | null;
  currency: string;
  status: string;
  reference: string | null;
  deliveryType: string | null;
  isDefault: boolean;
  iconUrl: string | null;
  estimatedArrival: string | null;
};

/** Métodos de saque já salvos na Whop. O cadastro em si abre o payouts_portal. */
export async function listPayoutMethods(accountId: string, apiKey?: string | null): Promise<PayoutMethodRow[]> {
  const client = getWhop(await keyFor(accountId, apiKey));
  const page = await client.payouts.methods.list({
    account_id: accountId,
    first: 20,
  });
  return page.data.map((item) => ({
    id: item.id,
    nickname: item.nickname,
    payerName: item.payer_name,
    currency: item.destination_currency,
    status: item.status,
    reference: item.account_reference,
    deliveryType: item.supported_payout_method?.delivery_type ?? null,
    isDefault: item.is_default,
    iconUrl: item.supported_payout_method?.icon_url ?? null,
    estimatedArrival: item.estimated_arrival?.standard ?? item.estimated_arrival?.instant ?? null,
  }));
}
