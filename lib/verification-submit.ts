import { prisma } from "@/lib/prisma";
import { PROOF_FIELD_ID } from "@/lib/verification-tasks";

async function getWhopForAccount(accountId: string) {
  const user = await prisma.user.findFirst({ where: { whopBizId: accountId }, select: { whopApiKey: true } });
  return getWhop(user?.whopApiKey);
}

import { getWhop, whopErrorMessage } from "@/lib/whop";

const FILE_ID = /^file_[A-Za-z0-9]+$/;
const ITEM_ID = /^inrqi_[A-Za-z0-9]+$/;

export type VerificationAnswer = {
  id: string;
  value?: string;
  values?: string[];
  files?: string[];
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  documents?: Record<string, string>;
};

const ID_SLOTS = new Set([
  "passport_front",
  "id_card_front",
  "id_card_back",
  "drivers_front",
  "drivers_back",
  "residence_permit_front",
  "residence_permit_back",
]);

function fileIds(values: string[] | undefined) {
  return (values ?? []).filter((value) => FILE_ID.test(value));
}

function requirementOf(item: { requirement?: string | null; field?: string | null }) {
  return item.requirement || item.field || "";
}

function wantsFiles(item: { type?: string | null; requirement?: string | null; field?: string | null }) {
  const type = (item.type ?? "").toLowerCase();
  if (type === "files" || type === "file" || type === "document" || type === "documents") return true;
  return requirementOf(item) === "proof_of_fulfillment" && type !== "text" && type !== "text_with_files";
}

export type OpenInformation = {
  verificationId: string;
  id: string;
  requirement: string;
  label: string;
  type: string;
  responseType?: string | null;
  supportingFilesRequired?: boolean;
  errors?: string[];
};

function isProofItem(item: { requirement: string; label: string; type: string; field?: string | null }) {
  const requirement = requirementOf(item);
  const text = `${requirement} ${item.label}`.toLowerCase();
  if (requirement === "proof_of_fulfillment") return true;
  if (/proof of fulfillment|prova de cumprimento|proof of delivery/.test(text)) return true;
  return requirement === "proof_of_funnel" && wantsFiles(item);
}

function acceptsUploadedFiles(item: OpenInformation) {
  return wantsFiles(item) || Boolean(item.supportingFilesRequired);
}

function proofTarget(open: OpenInformation[]) {
  const named = open.find((item) => isProofItem(item));
  if (named) return named;
  const uploads = open.filter((item) => acceptsUploadedFiles(item));
  if (uploads.length === 1) return uploads[0];
  return uploads.find((item) =>
    /proof|fulfill|delivery|prova|arquivo|document|statement/.test(
      `${item.requirement} ${item.label}`.toLowerCase(),
    ),
  );
}

/** Lê de novo os pedidos abertos. O retrieve completa o que a lista às vezes omite. */
export async function loadOpenInformation(accountId: string): Promise<OpenInformation[]> {
  const client = await getWhopForAccount(accountId);
  const list = await client.verifications.list({ account_id: accountId });
  const rows = await Promise.all(
    (list.data ?? []).map(async (verification) => {
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

  const items: OpenInformation[] = [];
  for (const verification of rows) {
    if (!verification.id || verification.status === "approved") continue;
    for (const item of verification.requested_information ?? []) {
      const raw = item as typeof item & { field?: string | null; error_message?: string | null };
      const reasons = (item.errors ?? [])
        .map((error) => error.reason || error.code || "")
        .filter(Boolean);
      if (reasons.length === 0 && raw.error_message?.trim()) reasons.push(raw.error_message.trim());
      items.push({
        verificationId: verification.id,
        id: item.id,
        requirement: requirementOf(raw),
        label: item.label,
        type: item.type,
        responseType: item.response_type,
        supportingFilesRequired: item.supporting_files_required,
        errors: reasons,
      });
    }
  }

  // Se não há RFI formal mas a conta tem submit_information_request,
  // cria a verificação de negócio para obter as perguntas reais.
  if (items.length === 0) {
    try {
      const account = await client.accounts.retrieve({ id: accountId });
      const hasInfoRequest = (account.required_actions ?? []).some(
        (a) => a.action === "submit_information_request",
      );
      if (hasInfoRequest) {
        return await ensureBusinessVerification(accountId);
      }
    } catch (error) {
      console.error("[thesain26] ensureBusinessVerification check", whopErrorMessage(error));
    }
  }

  return items;
}

/** Garante que existe uma verificação de negócio e devolve os pedidos abertos.
 *  Usado quando a Whop só tem required_action (submit_information_request)
 *  e ainda não criou o objeto de verificação. */
export async function ensureBusinessVerification(accountId: string): Promise<OpenInformation[]> {
  const client = await getWhopForAccount(accountId);
  const list = await client.verifications.list({ account_id: accountId });
  let business = (list.data ?? []).find((v) => v.kind === "business" && v.status !== "approved");

  if (!business) {
    try {
      const created = await client.verifications.create({
        account_id: accountId,
        body: { kind: "business" },
      });
      if (created?.id) business = created;
    } catch (error) {
      console.error("[thesain26] verifications.create business", whopErrorMessage(error));
    }
  }

  if (!business?.id) return [];

  let full = business;
  try {
    full = await client.verifications.retrieve({ id: business.id });
  } catch (error) {
    console.error("[thesain26] verifications.retrieve", whopErrorMessage(error));
  }

  const items: OpenInformation[] = [];
  for (const item of full.requested_information ?? []) {
    const raw = item as typeof item & { field?: string | null; error_message?: string | null };
    const reasons = (item.errors ?? [])
      .map((error) => error.reason || error.code || "")
      .filter(Boolean);
    if (reasons.length === 0 && raw.error_message?.trim()) reasons.push(raw.error_message.trim());
    items.push({
      verificationId: full.id!,
      id: item.id,
      requirement: requirementOf(raw),
      label: item.label,
      type: item.type,
      responseType: item.response_type,
      supportingFilesRequired: item.supporting_files_required,
      errors: reasons,
    });
  }
  return items;
}

export async function loadOpenInformationUntilProof(accountId: string, attempts = 4) {
  let open = await loadOpenInformation(accountId);
  for (let attempt = 1; attempt < attempts && !open.some((item) => isProofItem(item)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    open = await loadOpenInformation(accountId);
  }
  return open;
}

function attachProofFiles(bucket: VerificationAnswer[], proofId: string, answer: VerificationAnswer, files: string[]) {
  const existing = bucket.find((item) => item.id === proofId);
  if (existing) {
    existing.files = [...fileIds(existing.files), ...files];
    return;
  }
  bucket.push({ ...answer, id: proofId, files });
}

export function assignVerificationAnswers(answers: VerificationAnswer[], open: OpenInformation[]) {
  const byId = new Map(open.map((item) => [item.id, item]));
  const groups = new Map<string, VerificationAnswer[]>();
  const proof = proofTarget(open);
  let missingProof = false;

  for (const answer of answers) {
    const files = fileIds(answer.files);
    const known = byId.get(answer.id);
    const synthetic = answer.id === PROOF_FIELD_ID;
    const staleFileAnswer = !synthetic && !known && files.length > 0 && Boolean(proof);
    if (synthetic || staleFileAnswer) {
      if (files.length === 0) continue;
      if (!proof) {
        missingProof = true;
        continue;
      }
      const bucket = groups.get(proof.verificationId) ?? [];
      attachProofFiles(bucket, proof.id, answer, files);
      groups.set(proof.verificationId, bucket);
      continue;
    }

    if (!known || !ITEM_ID.test(answer.id)) continue;
    const bucket = groups.get(known.verificationId) ?? [];
    bucket.push(answer);
    groups.set(known.verificationId, bucket);
  }

  return {
    missingProof,
    groups: [...groups.entries()].map(([verificationId, grouped]) => ({
      verificationId,
      answers: grouped,
    })),
  };
}

export async function uploadPrivateFile(file: {
  accountId: string;
  name: string;
  type: string;
  bytes: Buffer;
}) {
  const client = await getWhopForAccount(file.accountId);
  const created = await client.files.create({
    filename: file.name,
    byte_size: file.bytes.length,
    visibility: "private",
  });
  if (!created.id || !created.upload_url) {
    throw new Error("A Whop não abriu o envio do arquivo.");
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(created.upload_headers ?? {})) {
    if (typeof value === "string" && value) headers.set(key, value);
  }
  if (!headers.has("content-type") && file.type) {
    headers.set("content-type", file.type);
  }

  const uploaded = await fetch(created.upload_url, {
    method: "PUT",
    headers,
    body: new Uint8Array(file.bytes),
  });
  if (!uploaded.ok) {
    throw new Error("O arquivo não chegou na Whop.");
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await client.files.retrieve({ id: created.id });
    if (current.upload_status === "ready") return created.id;
    if (current.upload_status === "failed") {
      throw new Error("A Whop recusou este arquivo.");
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return created.id;
}

export async function submitVerificationAnswers(params: {
  accountId: string;
  verificationId: string;
  answers: VerificationAnswer[];
}) {
  const client = await getWhopForAccount(params.accountId);
  const list = await client.verifications.list({ account_id: params.accountId });
  const listed = (list.data ?? []).find((item) => item.id === params.verificationId);
  if (!listed?.id) {
    throw new Error("Este pedido não pertence à sua conta.");
  }

  let requestedInformation = listed.requested_information ?? [];
  try {
    const full = await client.verifications.retrieve({ id: listed.id });
    if ((full.requested_information?.length ?? 0) >= requestedInformation.length) {
      requestedInformation = full.requested_information ?? requestedInformation;
    }
  } catch (error) {
    console.error("[thesain26] verifications.retrieve", whopErrorMessage(error));
  }

  const open = new Map(requestedInformation.map((item) => [item.id, item]));
  const requested = params.answers.filter((answer) => ITEM_ID.test(answer.id) && open.has(answer.id));
  if (requested.length === 0) {
    throw new Error("Não há informação pendente para enviar.");
  }

  const payload = requested.map((answer) => {
    const item = open.get(answer.id)!;
    if (wantsFiles(item)) {
      const files = fileIds(answer.files);
      if (files.length === 0) throw new Error(`Envie pelo menos um arquivo de “${item.label}”.`);
      return { id: item.id, files };
    }
    if (item.type === "id_document") {
      const documents: Record<string, string> = {};
      for (const [slot, fileId] of Object.entries(answer.documents ?? {})) {
        if (ID_SLOTS.has(slot) && FILE_ID.test(fileId)) documents[slot] = fileId;
      }
      if (Object.keys(documents).length === 0) {
        throw new Error(`Envie o documento de “${item.label}”.`);
      }
      return { id: item.id, documents };
    }
    if (item.type === "address") {
      const address = answer.address;
      if (!address?.line1 || !address.city || !address.country) {
        throw new Error(`Complete o endereço de “${item.label}”.`);
      }
      return {
        id: item.id,
        address: {
          line1: address.line1,
          line2: address.line2 || null,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country.toUpperCase(),
        },
      };
    }
    if (item.type === "select" && item.selection_mode === "multiple") {
      const values = (answer.values ?? []).filter((value) => item.options?.includes(value));
      if (values.length === 0) throw new Error(`Escolha uma opção em “${item.label}”.`);
      return { id: item.id, values };
    }
    if (item.selection_mode === "multiple" && (item.response_type === "url" || item.type === "url")) {
      const values = (answer.values ?? []).map((value) => value.trim()).filter(Boolean);
      if (values.length === 0) throw new Error(`Informe pelo menos um endereço em “${item.label}”.`);
      return { id: item.id, values };
    }
    if (item.type === "liveness") {
      return { id: item.id, value: "true" };
    }
    const value = answer.value?.trim() ?? "";
    if (!value) throw new Error(`Preencha “${item.label}”.`);
    if (item.requirement === "business_description" && (value.length < 100 || value.length > 1000)) {
      throw new Error("A descrição precisa ter entre 100 e 1000 caracteres.");
    }
    if (item.type === "select" && item.options?.length && !item.options.includes(value)) {
      throw new Error(`A opção de “${item.label}” não é aceita.`);
    }
    const files = fileIds(answer.files);
    if (item.type === "text_with_files" || item.supporting_files_required || files.length > 0) {
      if (item.supporting_files_required && files.length === 0) {
        throw new Error(`Envie os arquivos de “${item.label}”.`);
      }
      return { id: item.id, value, ...(files.length > 0 ? { files } : {}) };
    }
    return { id: item.id, value };
  });

  try {
    return await client.verifications.update({
      id: listed.id,
      body: { requested_information: payload },
    });
  } catch (error) {
    throw new Error(whopErrorMessage(error));
  }
}
