"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listCountries } from "@/lib/countries";
import {
  MAX_VERIFICATION_FILES,
  VERIFICATION_FILE_ACCEPT,
  verificationFileKind,
} from "@/lib/verification-files";
import type { InformationField } from "@/lib/verification-tasks";

const ID_LABELS: Record<string, string> = {
  ID_CARD: "Identidade",
  DRIVERS: "Carteira de motorista",
  PASSPORT: "Passaporte",
  RESIDENCE_PERMIT: "Autorização de residência",
};

const MAX_FILES = MAX_VERIFICATION_FILES;

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
  return field.type === "files" || field.type === "file" || field.type === "text_with_files";
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
    const kind = verificationFileKind(file);
    if (!kind.ok) {
      rejected.push(kind.reason);
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
  profile,
}: {
  verificationId?: string;
  fields: InformationField[];
  label: string;
  profile?: {
    description: string;
    socialUrl: string;
    askDescription: boolean;
    askSocial: boolean;
    descriptionRequired: boolean;
    socialRequired: boolean;
    askTax?: boolean;
    taxHandling?: "whop" | "self" | "none" | null;
  } | null;
}) {
  const router = useRouter();
  const countries = listCountries();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [idTypes, setIdTypes] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, File[]>>({});
  const [taxChoice, setTaxChoice] = useState<"self" | "whop" | "none" | "">("");
  const [taxOptOut, setTaxOptOut] = useState({ responsible: false, liability: false, noCollection: false });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      if (profile?.askTax && !taxChoice) {
        throw new Error("Escolha como o imposto das vendas deve ser tratado.");
      }
      if (
        profile?.askTax &&
        taxChoice === "none" &&
        (!taxOptOut.responsible || !taxOptOut.liability || !taxOptOut.noCollection)
      ) {
        throw new Error("Confirme as três declarações para cuidar do imposto por conta própria.");
      }

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
        if (needsFiles(field) || field.requirement === "proof_of_fulfillment") {
          const picked = attachments[field.id] ?? [];
          const requiresUpload = !field.optional && field.type !== "text";
          if (requiresUpload && picked.length === 0) {
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

      const response = await fetch("/api/whop/business-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId: verificationId || undefined,
          answers,
          description: profile?.askDescription ? String(form.get("profile.description") ?? "") : undefined,
          socialUrl: profile?.askSocial ? String(form.get("profile.social") ?? "") : undefined,
          taxHandling: profile?.askTax && taxChoice ? taxChoice : undefined,
          taxOptOut:
            profile?.askTax && taxChoice === "none"
              ? {
                  responsible: taxOptOut.responsible,
                  liability: taxOptOut.liability,
                  noCollection: taxOptOut.noCollection,
                }
              : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; redirect?: string };
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
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
      {profile?.askDescription ? <DescriptionField initial={profile.description} required={profile.descriptionRequired} /> : null}
      {profile?.askSocial ? (
        <div className="space-y-2">
          <Label htmlFor="profile.social">Perfil de rede social ou site</Label>
          <Input
            id="profile.social"
            name="profile.social"
            defaultValue={profile.socialUrl}
            required={profile.socialRequired}
            placeholder="https://instagram.com/sua-loja ou https://seusite.com"
          />
        </div>
      ) : null}
      {profile?.askTax ? (
        <TaxChoice
          value={taxChoice}
          onChange={setTaxChoice}
          optOut={taxOptOut}
          onOptOut={setTaxOptOut}
        />
      ) : null}
      {fields.map((field) => (
        <fieldset key={field.id} className="space-y-2">
          <Label htmlFor={field.id}>
            {field.label}
            {field.optional ? " (opcional)" : ""}
          </Label>
          {field.detailsLabel ? <p className="text-sm text-muted-foreground">{field.detailsLabel}</p> : null}
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

const TAX_OPTIONS = [
  {
    id: "self" as const,
    title: "A Whop cobra o imposto, eu repasso",
    recommended: true,
    body: "A Whop cobra o imposto no checkout onde você tem registro fiscal e inclui esse valor no seu saque, para você repassar.",
    meta: "Taxa de 2% por transação · disponível em mais de 90 países",
  },
  {
    id: "whop" as const,
    title: "A Whop cobra e repassa o imposto",
    recommended: false,
    body: "A Whop cobra o imposto no checkout e depois repassa. Vale para vendas nas regiões em que a Whop é registrada.",
    meta: "Taxa de 2% por transação · só EUA, Reino Unido e União Europeia",
  },
  {
    id: "none" as const,
    title: "Eu mesmo cuido do imposto",
    recommended: false,
    body: "A Whop não cobra imposto no checkout. Você assume toda a responsabilidade em todos os lugares onde vende.",
    meta: "",
  },
];

function TaxChoice({
  value,
  onChange,
  optOut,
  onOptOut,
}: {
  value: "" | "self" | "whop" | "none";
  onChange: (value: "self" | "whop" | "none") => void;
  optOut: { responsible: boolean; liability: boolean; noCollection: boolean };
  onOptOut: (value: { responsible: boolean; liability: boolean; noCollection: boolean }) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Como o imposto deve ser tratado nas suas vendas?</legend>
      <p className="text-sm text-muted-foreground">
        A Whop pede essa escolha antes das provas. Sem ela, os arquivos da análise não seguem.
      </p>
      <div className="space-y-2">
        {TAX_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              className={`block cursor-pointer rounded-xl border px-4 py-3 ${
                selected ? "border-primary ring-1 ring-primary" : "border-input"
              }`}
            >
              <span className="flex items-start gap-3">
                <input
                  type="radio"
                  name="tax.handling"
                  value={option.id}
                  checked={selected}
                  onChange={() => onChange(option.id)}
                  className="mt-1"
                  required
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {option.title}
                    {option.recommended ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Recomendado</span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{option.body}</span>
                  {option.meta ? <span className="mt-1 block text-xs text-muted-foreground">{option.meta}</span> : null}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {value === "none" ? (
        <div className="space-y-3 rounded-xl bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium">Antes de sair da cobrança automática de imposto</p>
          <p className="text-sm text-destructive">
            A Whop não vai calcular, cobrar nem mostrar imposto no checkout. Você assume toda a responsabilidade fiscal
            em todos os lugares onde vende.
          </p>
          {(
            [
              ["responsible", "Entendo que sou responsável por calcular e cobrar o imposto de vendas e o VAT corretos dos compradores onde isso se aplica."],
              ["liability", "Entendo que deixar de cobrar ou pagar o imposto corretamente pode gerar multas, auditorias ou responsabilidade legal."],
              ["noCollection", "Entendo que a Whop não vai calcular, cobrar nem mostrar imposto no checkout para mim."],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={optOut[key]}
                onChange={(event) => onOptOut({ ...optOut, [key]: event.target.checked })}
                required
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function DescriptionField({ initial, required }: { initial: string; required: boolean }) {
  const [value, setValue] = useState(initial);
  const count = value.trim().length;
  return (
    <div className="space-y-2">
      <Label htmlFor="profile.description">Descrição da empresa</Label>
      <p className="text-sm text-muted-foreground">
        Descreva o que a empresa vende, o que o cliente recebe depois do pagamento e onde acessa a compra.
      </p>
      <Textarea
        id="profile.description"
        name="profile.description"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required={required || count < 100}
        minLength={100}
        maxLength={1000}
        placeholder="Descreva o negócio e o que o cliente recebe"
      />
      <p className={count < 100 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {count}/100 caracteres no mínimo · até 1000
      </p>
    </div>
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

  if (field.type === "files" || field.type === "file" || field.type === "document" || field.type === "documents") {
    return <FileStack files={files} onChange={onFiles} />;
  }
  if (field.requirement === "proof_of_fulfillment" && field.type !== "text" && field.type !== "text_with_files") {
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

  if (
    field.responseType === "url" ||
    field.type === "url" ||
    /social|website|perfil|rede/.test(field.requirement.toLowerCase())
  ) {
    return (
      <Input
        id={field.id}
        name={field.id}
        defaultValue=""
        required={!field.optional}
        placeholder="https://instagram.com/sua-loja ou https://seusite.com"
      />
    );
  }

  if (
    /descri|about|sobre|source_of_wealth|proposed_use|explain/.test(
      `${field.requirement} ${field.label}`.toLowerCase(),
    ) ||
    (field.type === "text" && field.label.length > 40)
  ) {
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
          accept={VERIFICATION_FILE_ACCEPT}
          multiple
          className="sr-only"
          onChange={(event) => add(event.target.files)}
        />
        <span className="text-sm font-medium">{files.length === 0 ? "Clique para enviar" : "Adicionar outro arquivo"}</span>
        <span className="text-xs text-muted-foreground">
          Vários de uma vez. Imagens (JPEG, PNG e outras), PDF ou vídeo (MP4 e outros).
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
        {files.length} de {MAX_FILES} arquivos · imagens e PDF até 32 MB · vídeo até 100 MB
      </p>
      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
    </div>
  );
}
