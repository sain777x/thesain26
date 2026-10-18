"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BusinessInfoForm({
  initialDescription,
  initialSocial,
}: {
  initialDescription: string;
  initialSocial: string;
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

  if (ok) {
    return (
      <p className="text-sm text-green-700">
        Informações enviadas. A Whop vai analisar (geralmente em menos de 24h). Clique em Atualizar para conferir o status.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Descrição do negócio *</label>
        <p className="text-xs text-muted-foreground">
          Descreva o que você vende, o que o cliente recebe após o pagamento e como acessa (mín. 100 caracteres).
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={100}
          maxLength={1000}
          rows={5}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Ex.: Mentoria 1:1 ao vivo sobre Amazon FBA. Após o pagamento envio o link da sessão e os materiais via WhatsApp."
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
        {loading ? "Enviando..." : "Enviar informações"}
      </button>
    </form>
  );
}
