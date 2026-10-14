"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listCountries } from "@/lib/countries";
import type { InformationField } from "@/lib/verification-tasks";

const ID_LABELS: Record<string, string> = {
  ID_CARD: "Identidade",
  DRIVERS: "Carteira de motorista",
  PASSPORT: "Passaporte",
  RESIDENCE_PERMIT: "Autorização de residência",
};

const MAX_FILES = 20;
const DOCUMENT_BYTES = 32 * 1024 * 1024;
const VIDEO_BYTES = 100 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);
const FILE_ACCEPT =
  "image/jpeg,image/png,application/pdf,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.pdf,.mp4,.mov,.m4v,.webm";

const ID_SLOTS: Record<string, { key: string; label: string }[]> = {
  PASSPORT: [{ key: "passport_front", label: "Página da foto" }],
  ID_CARD: [
    { key: "id_card_front", label: "Frente" },
    { key: "id_card_back", label: "Verso" },
  ],
  DRIVERS: [
    { key: "drivers_front", label: "Frente" },
    { key: "drivers_back", label: "Verso" },
  ],
  RESIDENCE_PERMIT: [
    { key: "residence_permit_front", label: "Frente" },
    { key: "residence_permit_back", label: "Verso" },
  ],
};

type AddressValue = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

async function sendFile(file: File) {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/whop/files", { method: "POST", body });
  const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok || !data.id) {
    throw new Error(data.error ?? "Não foi possível enviar o arquivo.");
  }
  return data.id;
}

function needsFiles(field: InformationField) {
  return field.type === "files" || field.type === "text_with_files";
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function fileKind(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (DOCUMENT_TYPES.has(type) || type === "image/jpg" || /\.(jpe?g|png|pdf)$/.test(name)) {
    return "document" as const;
  }
  if (VIDEO_TYPES.has(type) || /\.(mp4|mov|m4v|webm)$/.test(name)) return "video" as const;
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function absorbFiles(current: File[], incoming: FileList | File[] | null) {
  const next = [...current];
  const rejected: string[] = [];
  for (const file of incoming ?? []) {
    if (next.length >= MAX_FILES) {
      rejected.push(`Dá para enviar até ${MAX_FILES} arquivos neste pedido.`);
      break;
    }
    const kind = fileKind(file);
    if (!kind) {
      rejected.push(`${file.name} precisa ser JPEG, PNG, PDF ou vídeo (MP4, MOV ou WEBM).`);
      continue;
    }
    const limit = kind === "video" ? VIDEO_BYTES : DOCUMENT_BYTES;
    if (file.size <= 0 || file.size > limit) {
      rejected.push(
        kind === "video"
          ? `${file.name} passa de 100 MB. Envie um vídeo menor.`
          : `${file.name} precisa ter até 32 MB.`,
      );
      continue;
    }
    if (next.some((item) => fileKey(item) === fileKey(file))) continue;
    next.push(file);
  }
  return { next, notice: rejected[0] ?? null };
}

export function VerificationForm({
  verificationId,
  fields,
  label,
}: {
  verificationId: string;
  fields: InformationField[];
  label: string;
}) {
  const router = useRouter();
  const countries = listCountries();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [idTypes, setIdTypes] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, File[]>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const answers = [];
      for (const field of fields) {
        if (field.type === "address") {
          answers.push({
            id: field.id,
            address: {
              line1: String(form.get(`${field.id}.line1`) ?? ""),
              line2: String(form.get(`${field.id}.line2`) ?? ""),
              city: String(form.get(`${field.id}.city`) ?? ""),
              state: String(form.get(`${field.id}.state`) ?? ""),
              postal_code: String(form.get(`${field.id}.postal_code`) ?? ""),
              country: String(form.get(`${field.id}.country`) ?? ""),
            } satisfies AddressValue,
          });
          continue;
        }
        if (field.type === "id_document") {
          const chosen = idTypes[field.id] || field.options?.[0] || "ID_CARD";
          const slots = ID_SLOTS[chosen] ?? ID_SLOTS.ID_CARD;
          const documents: Record<string, string> = {};
          for (const slot of slots) {
            const picked = form.get(`${field.id}.${slot.key}`);
            if (picked instanceof File && picked.size > 0) {
              documents[slot.key] = await sendFile(picked);
            }
          }
          answers.push({ id: field.id, documents });
          continue;
        }
        if (field.type === "select" && field.selectionMode === "multiple") {
          answers.push({
            id: field.id,
            values: form.getAll(`${field.id}.values`).map(String),
          });
          continue;
        }
        if (field.type === "liveness") {
          answers.push({ id: field.id, value: form.get(field.id) === "on" ? "true" : "" });
          continue;
        }

        const answer: { id: string; value?: string; files?: string[] } = {
          id: field.id,
          value: String(form.get(field.id) ?? ""),
        };
        if (needsFiles(field)) {
          const picked = attachments[field.id] ?? [];
          if (field.type === "files" && !field.optional && picked.length === 0) {
            throw new Error(`Adicione pelo menos um arquivo em “${field.label}”.`);
          }
          answer.files = [];
          for (const [index, file] of picked.entries()) {
            setProgress(`Enviando arquivo ${index + 1} de ${picked.length}…`);
            answer.files.push(await sendFile(file));
          }
        }
        answers.push(answer);
      }

      const response = await fetch("/api/whop/verifications/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId, answers }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "A análise não aceitou as respostas.");
      }
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar.");
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Informações enviadas. A análise segue daqui. Atualize esta página se o pedido continuar na lista.
      </p>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      {fields.map((field) => (
        <fieldset key={field.id} className="space-y-2">
          <Label htmlFor={field.id}>
            {field.label}
            {field.optional ? " (opcional)" : ""}
          </Label>
          {field.errors?.map((reason) => (
            <p key={reason} className="text-sm text-destructive">
              {reason}
            </p>
          ))}
          <FieldControl
            field={field}
            countries={countries}
            idType={idTypes[field.id] || field.options?.[0] || "ID_CARD"}
            onIdType={(value) => setIdTypes((current) => ({ ...current, [field.id]: value }))}
            files={attachments[field.id] ?? []}
            onFiles={(next) =>
              setAttachments((current) => ({
                ...current,
                [field.id]: next,
              }))
            }
          />
        </fieldset>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {pending ? progress ?? "Enviando…" : label}
      </Button>
    </form>
  );
}

function FieldControl({
  field,
  countries,
  idType,
  onIdType,
  files,
  onFiles,
}: {
  field: InformationField;
  countries: { code: string; localName: string; flag: string }[];
  idType: string;
  onIdType: (value: string) => void;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  if (field.type === "address") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name={`${field.id}.line1`} placeholder="Rua e número" required={!field.optional} className="sm:col-span-2" />
        <Input name={`${field.id}.line2`} placeholder="Complemento" className="sm:col-span-2" />
        <Input name={`${field.id}.city`} placeholder="Cidade" required={!field.optional} />
        <Input name={`${field.id}.state`} placeholder="Estado" required={!field.optional} />
        <Input name={`${field.id}.postal_code`} placeholder="CEP" required={!field.optional} />
        <select
          name={`${field.id}.country`}
          required={!field.optional}
          defaultValue="BR"
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {country.localName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "select" && field.selectionMode === "multiple") {
    return (
      <div className="space-y-2">
        {(field.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={`${field.id}.values`} value={option} />
            {ID_LABELS[option] ?? option.replaceAll("_", " ")}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "select" || field.responseType === "yes_no" || field.responseType === "yes_no_na") {
    const options =
      field.options ??
      (field.responseType === "yes_no_na" ? ["yes", "no", "na"] : ["yes", "no"]);
    return (
      <select
        id={field.id}
        name={field.id}
        required={!field.optional}
        className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        defaultValue=""
      >
        <option value="" disabled>
          Escolha
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {ID_LABELS[option] ?? option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "id_document") {
    const options = field.options?.length ? field.options : Object.keys(ID_SLOTS);
    const slots = ID_SLOTS[idType] ?? ID_SLOTS.ID_CARD;
    return (
      <div className="space-y-2">
        <select
          value={idType}
          onChange={(event) => onIdType(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {ID_LABELS[option] ?? option}
            </option>
          ))}
        </select>
        {slots.map((slot) => (
          <label key={slot.key} className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{slot.label}</span>
            <Input name={`${field.id}.${slot.key}`} type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" />
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "liveness") {
    const url = field.actionUrl && /sumsub|verify-identity|kyc/i.test(field.actionUrl) ? field.actionUrl : null;
    return (
      <div className="space-y-2">
        {url ? (
          <iframe title={field.label} src={url} allow="camera; microphone" className="h-[560px] w-full rounded-xl border" />
        ) : (
          <p className="text-sm text-muted-foreground">Conclua a prova de vida e confirme abaixo.</p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={field.id} />
          Já concluí a prova de vida
        </label>
      </div>
    );
  }

  if (field.type === "files") {
    return <FileStack files={files} onChange={onFiles} />;
  }

  if (field.type === "date" || field.responseType === "date") {
    return <Input id={field.id} name={field.id} type="date" required={!field.optional} />;
  }

  if (field.type === "phone" || field.responseType === "tel") {
    return (
      <Input
        id={field.id}
        name={field.id}
        type="tel"
        placeholder="+5511999999999"
        required={!field.optional}
      />
    );
  }

  if (field.requirement === "business_description" || (field.type === "text" && field.label.length > 40)) {
    return <Textarea id={field.id} name={field.id} required={!field.optional} />;
  }

  return (
    <div className="space-y-2">
      <Input id={field.id} name={field.id} required={!field.optional && field.type !== "text_with_files"} />
      {field.type === "text_with_files" ? <FileStack files={files} onChange={onFiles} /> : null}
    </div>
  );
}

function FileStack({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function add(incoming: FileList | File[] | null) {
    const result = absorbFiles(files, incoming);
    onChange(result.next);
    setNotice(result.notice);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <label
        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-input px-4 py-5 text-center hover:bg-muted/40"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          add(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          className="sr-only"
          onChange={(event) => add(event.target.files)}
        />
        <span className="text-sm font-medium">Adicionar arquivos</span>
        <span className="text-xs text-muted-foreground">
          Escolha vários de uma vez ou acrescente mais depois. Vídeo MP4 entra junto com as fotos.
        </span>
      </label>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum arquivo selecionado.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={fileKey(file)}
              className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {file.name}
                <span className="ml-2 text-xs text-muted-foreground">{formatSize(file.size)}</span>
              </span>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange(files.filter((item) => fileKey(item) !== fileKey(file)))}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {files.length} de {MAX_FILES} arquivos · JPEG, PNG, PDF até 32 MB · vídeo MP4, MOV ou WEBM até 100 MB
      </p>
      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
    </div>
  );
}
