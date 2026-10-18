"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BusinessInfoForm({
  initialDescription,
  initialSocial,
  officialUrl,
}: {
  initialDescription: string;
  initialSocial: string;
  officialUrl?: string | null;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [socialUrl, setSocialUrl] = useState(initialSocial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/whop/business-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, socialUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar");
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {officialUrl ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">Enviar direto pelo site</p>
          <p className="mt-1 text-amber-800">
            Preencha os campos abaixo e clique em Enviar. A resposta vai para a Whop sem sair do thesain26.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-amber-700">Ou abrir o formulário oficial da Whop</summary>
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-amber-800 underline"
            >
              Abrir formulário oficial (pode pedir login)
            </a>
          </details>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ok ? (
          <p className="text-sm text-green-700">
            Informações enviadas para a Whop. Clique em Atualizar para conferir se a pendência sumiu.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Descrição do negócio</label>
          <p className="text-xs text-muted-foreground">
            Atualiza a descrição na conta (mín. 100 caracteres). Não substitui o formulário oficial.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={100}
            maxLength={1000}
            rows={5}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Ex.: Mentoria 1:1 ao vivo. Após o pagamento envio o link e os materiais via WhatsApp."
          />
          <p className="text-xs text-muted-foreground">{description.length}/1000</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Rede social ou site</label>
          <input
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            type="url"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="https://instagram.com/seuusuario"
          />
        </div>
        <button
          type="submit"
          disabled={loading || description.length < 100}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Atualizar descrição na conta"}
        </button>
      </form>
    </div>
  );
}
