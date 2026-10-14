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

export async function uploadPrivateFile(file: {
  name: string;
  type: string;
  bytes: Buffer;
}) {
  const client = getWhop();
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
  const client = getWhop();
  const list = await client.verifications.list({ account_id: params.accountId });
  const verification = (list.data ?? []).find((item) => item.id === params.verificationId);
  if (!verification?.id) {
    throw new Error("Este pedido não pertence à sua conta.");
  }

  const open = new Map(
    (verification.requested_information ?? []).map((item) => [item.id, item]),
  );
  const requested = params.answers.filter((answer) => ITEM_ID.test(answer.id) && open.has(answer.id));
  if (requested.length === 0) {
    throw new Error("Não há informação pendente para enviar.");
  }

  const payload = requested.map((answer) => {
    const item = open.get(answer.id)!;
    if (item.type === "files") {
      const files = fileIds(answer.files);
      if (files.length === 0) throw new Error(`Envie o arquivo de “${item.label}”.`);
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
    if (item.type === "liveness") {
      return { id: item.id, value: "true" };
    }
    const value = answer.value?.trim() ?? "";
    if (!value) throw new Error(`Preencha “${item.label}”.`);
    if (item.type === "select" && item.options?.length && !item.options.includes(value)) {
      throw new Error(`A opção de “${item.label}” não é aceita.`);
    }
    if (item.type === "text_with_files") {
      return { id: item.id, value, files: fileIds(answer.files) };
    }
    return { id: item.id, value };
  });

  try {
    return await client.verifications.update({
      id: verification.id,
      body: { requested_information: payload },
    });
  } catch (error) {
    throw new Error(whopErrorMessage(error));
  }
}
