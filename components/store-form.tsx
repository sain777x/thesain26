"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StoreValues = {
  name: string;
  slug: string;
  description: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  published: boolean;
};

export function StoreForm({ store }: { store: StoreValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? ""),
        description: String(form.get("description") ?? ""),
        logoUrl: String(form.get("logoUrl") ?? ""),
        primaryColor: String(form.get("primaryColor") ?? ""),
        accentColor: String(form.get("accentColor") ?? ""),
        published: form.get("published") === "on",
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Não foi possível salvar a loja.");
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" defaultValue={store.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Endereço</Label>
          <Input id="slug" name="slug" defaultValue={store.slug} required />
          <p className="text-xs text-muted-foreground">thesain26 /loja/{store.slug}</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={store.description}
          className="min-h-28"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="logoUrl">URL da logo</Label>
        <Input
          id="logoUrl"
          name="logoUrl"
          defaultValue={store.logoUrl}
          placeholder="https://"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="primaryColor">Cor principal</Label>
          <Input
            id="primaryColor"
            name="primaryColor"
            type="color"
            defaultValue={store.primaryColor}
            className="h-10 p-1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="accentColor">Cor de destaque</Label>
          <Input
            id="accentColor"
            name="accentColor"
            type="color"
            defaultValue={store.accentColor}
            className="h-10 p-1"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={store.published}
          className="size-4 accent-primary"
        />
        Loja publicada
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-primary">Loja atualizada.</p> : null}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Salvando…" : "Salvar loja"}
      </Button>
    </form>
  );
}
