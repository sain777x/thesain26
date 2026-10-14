"use client";

import { useState } from "react";
import { BUSINESS_TYPES, COUNTRIES, INDUSTRY_TYPES } from "@/lib/business";
import { queueToast } from "@/components/toast";
import { NativeSelect } from "@/components/native-select";
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
  website: string;
  socialUrl: string;
  instagram: string;
  youtube: string;
  linkedin: string;
  businessType: string;
  industryType: string;
  country: string;
};

export function StoreForm({ store }: { store: StoreValues }) {
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setWarning(null);
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
        website: String(form.get("website") ?? ""),
        socialUrl: String(form.get("socialUrl") ?? ""),
        instagram: String(form.get("instagram") ?? ""),
        youtube: String(form.get("youtube") ?? ""),
        linkedin: String(form.get("linkedin") ?? ""),
        businessType: String(form.get("businessType") ?? ""),
        industryType: String(form.get("industryType") ?? ""),
        country: String(form.get("country") ?? "BR"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      whopWarning?: string | null;
    };
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Não foi possível salvar a loja.");
      return;
    }
    if (data.whopWarning) {
      setWarning(data.whopWarning);
      queueToast("Loja salva. A Whop não confirmou a sincronização.");
      return;
    }
    queueToast("Loja salva e sincronizada com a Whop.");
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
          maxLength={400}
          className="min-h-28"
        />
        <p className="text-xs text-muted-foreground">Até 400 caracteres. Sincroniza com a Whop.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="logoUrl">Logo</Label>
        <Input id="logoUrl" name="logoUrl" defaultValue={store.logoUrl} placeholder="https://" />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website">Site</Label>
          <Input id="website" name="website" defaultValue={store.website} placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="socialUrl">Rede principal</Label>
          <Input id="socialUrl" name="socialUrl" defaultValue={store.socialUrl} placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instagram">Instagram</Label>
          <Input id="instagram" name="instagram" defaultValue={store.instagram} placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="youtube">YouTube</Label>
          <Input id="youtube" name="youtube" defaultValue={store.youtube} placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="linkedin">LinkedIn</Label>
          <Input id="linkedin" name="linkedin" defaultValue={store.linkedin} placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">País de operação</Label>
          <NativeSelect id="country" name="country" defaultValue={store.country || "BR"}>
            {COUNTRIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="businessType">Tipo de negócio</Label>
          <NativeSelect id="businessType" name="businessType" defaultValue={store.businessType}>
            {BUSINESS_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="industryType">Tipo de indústria</Label>
          <NativeSelect id="industryType" name="industryType" defaultValue={store.industryType}>
            {INDUSTRY_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
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
      {warning ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Salvo na thesain26. A Whop respondeu: {warning}
        </p>
      ) : null}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Salvando…" : "Salvar loja"}
      </Button>
    </form>
  );
}
