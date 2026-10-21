"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FeeForm({ feePercent }: { feePercent: number }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feePercent: Number(form.get("feePercent")) }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Não foi possível salvar.");
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="feePercent">Comissão padrão (%)</Label>
        <Input
          id="feePercent"
          name="feePercent"
          type="number"
          min={0.5}
          max={80}
          step="0.1"
          defaultValue={feePercent}
          className="w-32"
        />
      </div>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
      {saved ? <p className="text-sm text-primary">Comissão atualizada.</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function SellerFeeForm({
  sellerId,
  override,
}: {
  sellerId: string;
  override: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("fee") ?? "").trim();
    const response = await fetch(`/api/admin/sellers/${sellerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feePercentOverride: raw === "" ? null : Number(raw),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Não foi possível salvar.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input
        name="fee"
        type="number"
        min={0.5}
        max={80}
        step="0.1"
        placeholder="Padrão"
        defaultValue={override ?? ""}
        className="h-8 w-24"
        aria-label="Comissão deste vendedor"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Ok
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}

export function DeleteKeyButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onClick() {
    if (!window.confirm("Apagar esta key do painel?")) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Não foi possível apagar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={onClick}>
        Apagar
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
}
