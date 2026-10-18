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
          <p className="font-medium text-amber-900">Para limpar a pendência na Whop</p>
          <p className="mt-1 text-amber-800">
            A Whop só remove o pedido quando o formulário oficial é preenchido. Clique no botão abaixo, complete os passos e depois volte aqui e clique em Atualizar.
          </p>
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Abrir formulário oficial da Whop
          </a>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ok ? (
          <p className="text-sm text-green-700">
            Descrição e rede social atualizadas na conta. A pendência só some depois que você completar o formulário oficial da Whop.
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
