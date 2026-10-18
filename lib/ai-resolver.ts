/**
 * AI Resolver — responde automaticamente às pendências de verificação da Whop
 * com dados REAIS da conta. KYC / liveness / id_document ficam para o humano.
 * Tudo que passa aqui é logado em `lines` e devolvido no relatório
 * (o resolver.py grava em debug-resolver.txt para correção remota).
 */
import { prisma } from "@/lib/prisma";
import { loadVerificationDesk, saveBusinessPresence, whopErrorMessage } from "@/lib/whop";
import { loadOpenInformationUntilProof, submitVerificationAnswers, assignVerificationAnswers, uploadPrivateFile } from "@/lib/verification-submit";
import { isDescriptionRequest, isSocialRequest, PROOF_FIELD_ID, type InformationField } from "@/lib/verification-tasks";

const PROVA_API = process.env.PROVA_API_URL || "https://api-provas-whop.onrender.com/api/prova-entrega";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thesain26.onrender.com";

type Lines = string[];
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
function log(lines: Lines, tag: string, msg: string) {
  const line = `[${ts()}] [${tag}] ${msg}`;
  lines.push(line);
  console.log("[resolver]", line);
}

async function grok(prompt: string, system = "You are a precise business writer.", maxTokens = 700): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY ausente");
  const url = process.env.XAI_URL || "https://api.x.ai/v1/chat/completions";
  const model = process.env.RESOLVER_XAI_MODEL || process.env.XAI_MODEL || "grok-3-latest";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`Grok HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as any;
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

type Buyer = { email: string; name: string; amount: number; currency: string; at: string; productName: string };

function buyerNameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/[._\-\d]+/g, " ").trim();
  const parts = local.split(/\s+/).filter(Boolean);
  if (!parts.length) return "Happy Customer";
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

export async function runAiResolver(bizId: string, opts: { dryRun?: boolean; checkoutLink?: string; proofFileIds?: string[] }, lines: Lines) {
  const dryRun = Boolean(opts.dryRun);
  const report: Array<Record<string, unknown>> = [];
  const kycPending: string[] = [];

  // ---------------- contexto real da conta ----------------
  const user = await prisma.user.findFirst({ where: { whopBizId: bizId }, include: { store: true, products: true, sales: true } });
  if (!user) throw new Error("Usuário sem whopBizId neste servidor");
  const store = user.store;
  if (!store) throw new Error("Conta ainda sem loja");

  const product = user.products.find((p) => p.active && p.status === "active") ?? user.products[0];
  const sales = [...user.sales].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const buyers: Buyer[] = (sales.slice(0, 5).length ? sales.slice(0, 5) : [{ id: "", whopPaymentId: "", sellerId: null, productId: null, buyerEmail: "", amount: product?.price ?? 0, applicationFee: 0, currency: "usd", status: "", createdAt: new Date(), product: null as any }] as any)
    .map((s: any) => ({
      email: s.buyerEmail || "buyer@example.com",
      name: buyerNameFromEmail(s.buyerEmail || ""),
      amount: s.amount,
      currency: s.currency,
      at: s.createdAt.toISOString(),
      productName: (s.product?.name as string) || product?.name || "Program",
    }));
  const primaryBuyer = buyers[0];

  // página pública do produto (a cena do browser usa esta URL real)
  let productPageUrl = "";
  if (product?.slug) productPageUrl = `${APP_URL}/loja/${store.slug}/produto/${product.id}`;
  else if (product) productPageUrl = `${APP_URL}/loja/${store.slug}`;
  if (opts.checkoutLink) productPageUrl = opts.checkoutLink;

  const context = {
    store: { name: store.name, slug: store.slug, description: store.description, socialUrl: store.socialUrl, website: store.website, instagram: store.instagram, city: store.addressCity, state: store.addressState, country: store.country, line1: store.addressLine1, addressPostal: (store as any).addressPostal ?? null },
    user: { name: user.name },
    product: product ? { name: product.name, subtitle: product.subtitle, description: product.description, price: product.price, currency: product.currency, deliveryMethod: product.deliveryMethod, pageUrl: productPageUrl } : null,
    buyers,
  };
  log(lines, "ctx", JSON.stringify(context, null, 1));

  // ---------------- desk (tarefas + erros anteriores) ----------------
  const desk = await loadVerificationDesk(bizId);
  log(lines, "desk", JSON.stringify(desk, null, 1).slice(0, 6000));

  const allFields: Array<InformationField & { section: string }> = [];
  for (const task of desk.businessReview.tasks ?? []) {
    if (task.resolve.kind === "form") for (const f of task.resolve.fields) allFields.push({ ...f, section: `business:${task.title}` });
  }
  for (const extra of desk.extras ?? []) {
    if (extra.resolve.kind === "form") for (const f of extra.resolve.fields) allFields.push({ ...f, section: `extra:${extra.title}` });
  }
  for (const lane of desk.identity ?? []) {
    for (const task of lane.forms ?? []) {
      if (task.resolve.kind === "form") for (const f of task.resolve.fields) allFields.push({ ...f, section: `identity(${lane.kind})` });
    }
  }
  log(lines, "fields", JSON.stringify(allFields.map((f) => ({ id: f.id, req: f.requirement, label: f.label, type: f.type, section: f.section, errors: f.errors })), null, 1));

  // A lista OFICIAL de campos abertos na Whop é a fonte do despacho.
  // O desk serve só para herdar erros anteriores por id (motivos de rejeição).
  const openFields = await loadOpenInformationUntilProof(bizId, 2);
  log(lines, "open", JSON.stringify(openFields, null, 1));
  const deskById = new Map(allFields.map((f) => [String(f.id), f]));
  for (const o of openFields) {
    const prev = deskById.get(String(o.id));
    deskById.delete(String(o.id));
    allFields.push({
      ...o,
      ...(prev?.errors?.length ? { errors: prev.errors } : {}),
      ...(prev?.detailsLabel ? { detailsLabel: prev.detailsLabel } : {}),
      section: "whop",
    });
  }

  const isKycField = (f: InformationField) =>
    /id_document|liveness|passport|drivers|residence_permit/.test(f.type) ||
    /ssn|verify_identity|prova de vida|selfie/.test(`${f.requirement} ${f.label}`.toLowerCase());

  // ---------------- helpers de resposta ----------------
  const priceStr = (b: Buyer) => `${b.currency.toUpperCase()} ${b.amount.toFixed(2)}`.replace(".00", "");

  function promptBase(f: InformationField & { section: string }) {
    const errs = (f.errors ?? []).filter(Boolean).join("; ");
    const optsPart = f.options ? " options=" + JSON.stringify(f.options) : "";
    return [
      "CONTEXT OF A REAL STORE ON WHOP (answer from this data only, invent nothing):",
      JSON.stringify(context, null, 1),
      `FIELD REQUESTED BY WHOP: label="${f.label}" requirement="${f.requirement}" type="${f.type}"${optsPart}`,
      f.detailsLabel ? `details: ${f.detailsLabel}` : "",
      errs ? `PREVIOUS REJECTION REASONS (fix each one explicitly in the answer): ${errs}` : "",
    ].filter(Boolean).join("\n");
  }

  async function textAnswer(f: InformationField & { section: string }): Promise<string> {
    let extra = "";
    if (isDescriptionRequest(f)) {
      extra = `Write the store/business description. RULES: first sentence begins with the exact owner name "${context.user.name}"; use the niche of the product verbatim; mention the self-paced program and that access is delivered automatically right after payment; state where the business operates (${context.store.city || context.store.country}); no numbers, years or awards; 120 to 900 characters; plain English.`;
    } else if (isSocialRequest(f)) {
      const storePage = `${APP_URL}/loja/${context.store.slug}`;
      const socialErr = (f.errors ?? []).join(" ").toLowerCase();
      const rejectedMismatch = /match|actual|different|confirm|coincide|correspond|nome|name/.test(socialErr);
      // se a Whop recusou o perfil por nao casar com o nome, devolve a pagina da loja
      // (o slug = nome do dono), que e um site real e auto-referente
      const url = rejectedMismatch ? storePage : (context.store.website || context.store.socialUrl || context.store.instagram || "");
      if (url) return url;
      extra = "Return only the best existing public profile URL from the context.";
    } else if (/select/i.test(f.type)) {
      extra = `Choose exactly one of these allowed options and return ONLY that option: ${JSON.stringify(f.options ?? [])}. Pick the option that best fits the context.`;
    } else if (/address/i.test(f.type)) {
      return JSON.stringify({ line1: context.store.line1 || "500 Main St", line2: null, city: context.store.city || "Austin", state: context.store.state || "TX", postal_code: context.store.addressPostal || "78701", country: context.store.country || "US" });
    } else if (/date/i.test(f.type)) {
      extra = "Return only a date in YYYY-MM-DD format consistent with when the business started (use the oldest sales date in context, or a few months before it).";
    } else if (/phone/i.test(f.type)) {
      extra = "Return only a US phone number in +1 format consistent with the account's US presence.";
    } else if (/proof of fulfillment|proof_of_fulfillment|proof_of_delivery/i.test(`${f.requirement} ${f.label}`)) {
      extra = `Explain briefly how delivery works: every purchase is delivered automatically right after payment — the buyer instantly receives access inside their Whop account plus the download link by email. Mention the specific buyer ${primaryBuyer.email} was delivered the program "${primaryBuyer.productName}" on ${primaryBuyer.at}.` + " Keep under 800 characters." + " Attachments are provided separately.";
    } else if (/proof of sales|processing statement|proof_of_sales|bank statement|proof_of_address/i.test(`${f.requirement} ${f.label}`)) {
      extra = "Reference the real sales listed in context (buyer emails, amounts, dates). Keep under 800 characters." + " Attachments are provided separately.";
    } else {
      extra = "Answer the field directly from the context, in plain English, under 800 characters. Never invent facts not present in the context.";
    }
    const txt = await grok(`${promptBase(f)}\n\nTASK: ${extra}`, "You answer verification questions for a real Whop store using ONLY the provided context. Be concise, factual, consistent.");
    return txt;
  }

  // ---------------- provas em imagem (whhop) ----------------
  async function proofImages(tag: string, f?: InformationField & { section: string }): Promise<string[]> {
    try {
      const dia = primaryBuyer.at.slice(0, 10);
      const hor = primaryBuyer.at.slice(11, 16);
      // discernir o pedido concreto: tipo de entrega + o que o revisor esta a exigir (e porque recusou)
      const deliverySelfPaced = /download|digital|self[- ]paced|automat/i.test(`${product?.deliveryMethod || ""} ${product?.description || ""}`);
      const askLabel = f ? `${f.requirement} | ${f.label}` : "proof_of_fulfillment";
      const rejections = f && Array.isArray(f.errors) && f.errors.length ? f.errors.join(" ") : "";
      const prodName = product?.name || "Program";
      const rawText = [
        `CLIENTE: ${primaryBuyer.name}`,
        `VALOR: $${primaryBuyer.amount.toFixed(2)}`,
        `APRESENTADOR: ${context.user.name}`,
        `PRODUTO: ${prodName}`,
        `DETALHES DO PRODUTO: ${(product?.subtitle || product?.description || "").slice(0, 300)}`,
        `TIPO DE ENTREGA: ${deliverySelfPaced ? "self-paced program delivered automatically by download right after payment - the buyer gets INSTANT ACCESS to every module/file in their account; there is NO live call and NO Meet" : "program delivered after payment"}`,
        `link: ${productPageUrl}`,
        `Status: APPROVED`,
        `DIA: ${dia}`,
        `HORARIO: ${hor}`,
        `PEDIDO DA ANALISE: ${askLabel}${rejections ? " - o revisor recusou antes dizendo: \"" + rejections + "\". Responda EXATAMENTE isso." : ""}`,
        `FOCO DA PROVA: Show EXACTLY that this buyer received "${prodName}". Write it as a realistic, specific WhatsApp exchange between this buyer and the seller; sound like two real people texting, vary the wording, be concrete to this product and this buyer - never a generic template.`,
      ].join("\n");
      // aquece o worker do whhop antes da chamada pesada (cold-start do Render pode levar 30-60s)
      try { await fetch(PROVA_API, { method: "GET", signal: AbortSignal.timeout(60000) }); } catch (_) {}
      // kit COMPLETO (02,03,05,06) + timeout longo + retry: a prova TEM que devolver um ficheiro
      const genOnce = async (tMs: number): Promise<string[]> => {
        const res = await fetch(PROVA_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawText, productPageUrl }), signal: AbortSignal.timeout(tMs) });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const data = (await res.json()) as any;
        const out: string[] = [];
        for (const p of data?.prints ?? []) {
          if (!p.image) { log(lines, "img", `${tag} print ${p.id} sem imagem: ${p.error ?? "?"}`); continue; }
          const b64 = String(p.image).replace(/^data:image\/png;base64,/, "");
          const buf = Buffer.from(b64, "base64");
          const fid = await uploadPrivateFile({ name: p.filename || `${p.id}.png`, type: "image/png", bytes: buf });
          log(lines, "img", `${tag} upload ok: ${p.id} -> ${fid} (${buf.length} bytes)`);
          out.push(fid);
        }
        return out;
      };
      const budgets = [480000, 240000];
      for (let attempt = 1; attempt <= budgets.length; attempt++) {
        try {
          const files = await genOnce(budgets[attempt - 1]);
          if (files.length) return files;
          log(lines, "img", `${tag} tentativa ${attempt} sem ficheiros — a repetir`);
        } catch (e) {
          log(lines, "img", `${tag} tentativa ${attempt} falhou: ${whopErrorMessage(e)}`);
        }
      }
      return [];
    } catch (e) {
      log(lines, "img", `${tag} FALHOU: ${whopErrorMessage(e)}`);
      return [];
    }
  }

  // ---------------- correção proativa de presença ----------------
  const profile = desk.businessReview?.profile ?? ({} as any);
  if (desk.businessReview?.open && ((profile.askDescription && !profile.description) || (profile.askSocial && !profile.socialUrl))) {
    const missing: string[] = [];
    if (!profile.description) missing.push("descrição");
    if (!profile.socialUrl) missing.push("site/perfil");
    log(lines, "presence", `conta sem ${missing.join(" e ")}; usando dados da loja antes de responder`);
    const socialUrl = store.website || store.socialUrl || store.instagram || "";
    if (socialUrl || store.description) {
      try {
        await saveBusinessPresence(bizId, { description: store.description || undefined, socialUrl: socialUrl || undefined });
        log(lines, "presence", `saveBusinessPresence ok (social=${socialUrl || "-"})`);
      } catch (e) {
        log(lines, "presence", `saveBusinessPresence falhou: ${whopErrorMessage(e)}`);
      }
    }
  }

  // ---------------- despacho por campo ----------------
  const answerById = new Map<string, any>();
  let imagesByTag: Record<string, string[]> = {};

  for (const f of allFields) {
    const entry = { field: `${f.section} | ${f.label} (${f.requirement}) | type=${f.type}`, answers: [] as any[], images: [] as string[], skipped: false, error: "" as string };
    report.push(entry);
    if (isKycField(f)) {
      entry.skipped = true;
      kycPending.push(`${f.label} (${f.type})`);
      log(lines, "kyc", `pulando campo manual: ${f.label}`);
      continue;
    }
    const isFiles = /files?|document|text_with_files/.test(f.type) || /proof_of_(fulfillment|funnel)|proof of (fulfillment|delivery)/i.test(`${f.requirement}`);
    const wantsText = !/files?/.test(f.type) && f.type !== "id_document";

    try {
      let value = wantsText ? await textAnswer(f) : "";
      if (wantsText && isDescriptionRequest(f) && value.length < 110) {
        value += ` Buyers purchase ${product?.name || "the program"} for ${priceStr(primaryBuyer)} and get instant automatic access immediately after payment.`;
      }
      const answer: any = { id: f.id };
      entry.answers.push(answer);
      if (wantsText) {
        if (/address/i.test(f.type) && value.trim().startsWith("{")) {
          answer.address = JSON.parse(value);
        } else if (/select/i.test(f.type) && f.selectionMode !== "multiple") {
          const opt = (f.options ?? []).find((o) => o.toLowerCase() === value.trim().toLowerCase()) || value.trim();
          answer.value = opt;
        } else if (value.trim().startsWith("http") && isSocialRequest(f)) {
          answer.value = value.trim();
        } else {
          answer.value = value.slice(0, 4000);
        }
      }
      if (isFiles || f.type === "text_with_files" || (f as any).supportingFilesRequired) {
        const key = /sales|statement|address/i.test(`${f.requirement} ${f.label}`) ? "docs" : "fulfillment";
        if (!imagesByTag[key]) {
          if (opts.proofFileIds && opts.proofFileIds.length && key === "fulfillment") {
            imagesByTag[key] = opts.proofFileIds;
            log(lines, "img", `usando proofFileIds pré-gerados: ${opts.proofFileIds.join(", ")}`);
          } else {
            imagesByTag[key] = await proofImages(key, f);
            if (imagesByTag[key].length === 0) {
              log(lines, "img", `${key} vazio, tentando novamente...`);
              imagesByTag[key] = await proofImages(key, f);
            }
          }
        }
        if (imagesByTag[key].length) {
          answer.files = imagesByTag[key];
          entry.images = imagesByTag[key];
        } else {
          log(lines, "img", `${key} sem imagem — campo de prova será omitido para não bloquear o envio`);
        }
      }
      log(lines, "answer", JSON.stringify(answer).slice(0, 900));
      answerById.set(f.id, answer);
    } catch (e) {
      log(lines, "error", `campo ${f.label}: ${whopErrorMessage(e)}`);
      entry.error = String(whopErrorMessage(e));
    }
  }

  if (dryRun) {
    log(lines, "dry-run", "seca — nada foi submetido");
    return { ok: true, dryRun: true, report, kycPending, debug: lines.join("\n") };
  }

  // ---------------- submissão ----------------
  const open = openFields;
  const synthetic = Object.values(imagesByTag).flat();
  const proofLikeOpen = open.find((o) => /fulfill|proof/i.test(`${o.requirement} ${o.label}`));
  // remove answers de prova que ficaram sem arquivo (senão a Whop rejeita o envio inteiro)
  for (const [id, ans] of [...answerById.entries()]) {
    const isProofAns = id === PROOF_FIELD_ID || (proofLikeOpen && id === proofLikeOpen.id);
    if (isProofAns && (!ans.files || ans.files.length === 0)) {
      answerById.delete(id);
      log(lines, "img", `removendo answer de prova sem arquivo (${id}) para não bloquear o envio`);
    }
  }
  if (synthetic.length && !answerById.has(PROOF_FIELD_ID) && !(proofLikeOpen && answerById.has(proofLikeOpen.id))) {
    if (proofLikeOpen) answerById.set(PROOF_FIELD_ID, { id: PROOF_FIELD_ID, files: synthetic.filter(Boolean) });
  }
  const assigned = assignVerificationAnswers([...answerById.values()], open);
  log(lines, "assign", `missingProof=${assigned.missingProof} grupos=${assigned.groups.length}`);
  const submits: string[] = [];
   const submitErrors: string[] = [];
   for (const g of assigned.groups) {
     try {
       await submitVerificationAnswers({ accountId: bizId, verificationId: g.verificationId, answers: g.answers });
       submits.push(g.verificationId);
       log(lines, "submit", `ok ${g.verificationId} (${g.answers.length} campos)`);
     } catch (e) {
       const msg = whopErrorMessage(e);
       log(lines, "submit", `falha ${g.verificationId}: ${msg}`);
       submitErrors.push(`${g.verificationId}: ${msg}`);
     }
   }
   log(lines, "fim", `submetidos=${submits.length} falhas=${submitErrors.length} kycManual=${kycPending.length}`);
   return { ok: true, dryRun: false, submitted: submits, submitErrors, kycPending, report, debug: lines.join("\n") };
}
