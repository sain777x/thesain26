"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BUSINESS_TYPES, COUNTRIES, INDUSTRY_TYPES } from "@/lib/business";
import { queueToast } from "@/components/toast";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    if (result?.error) {
      setError("Email ou senha não conferem.");
      setPending(false);
      return;
    }
    router.push(callbackUrl || "/painel");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      storeName: String(form.get("storeName") ?? ""),
      description: String(form.get("description") ?? ""),
      socialUrl: String(form.get("socialUrl") ?? ""),
      businessType: String(form.get("businessType") ?? ""),
      industryType: String(form.get("industryType") ?? ""),
      country: String(form.get("country") ?? ""),
      addressLine1: String(form.get("addressLine1") ?? ""),
      addressCity: String(form.get("addressCity") ?? ""),
      addressState: String(form.get("addressState") ?? ""),
      addressPostalCode: String(form.get("addressPostalCode") ?? ""),
    };
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      whopWarning?: string | null;
    };
    if (!response.ok) {
      setError(data.error ?? "Não foi possível criar a conta.");
      setPending(false);
      return;
    }
    const result = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });
    if (result?.error) {
      router.push("/login");
      return;
    }
    queueToast(
      data.whopWarning
        ? "Conta criada. A Whop ainda não recebeu todos os dados."
        : "Loja criada e conta Whop sincronizada.",
    );
    const warning = data.whopWarning
      ? `?aviso=${encodeURIComponent(data.whopWarning)}`
      : "";
    router.push(`/painel${warning}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome completo</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="storeName">Nome da loja</Label>
          <Input id="storeName" name="storeName" required minLength={2} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição do negócio</Label>
        <Textarea
          id="description"
          name="description"
          required
          maxLength={400}
          className="min-h-24"
          placeholder="O que você vende e para quem."
        />
        <p className="text-xs text-muted-foreground">Até 400 caracteres. Vai para a Whop.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="socialUrl">Site ou rede social principal</Label>
        <Input
          id="socialUrl"
          name="socialUrl"
          required
          placeholder="instagram.com/sualoja ou https://sualoja.com"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="businessType">Tipo de negócio</Label>
          <NativeSelect id="businessType" name="businessType" defaultValue="digital_product" required>
            {BUSINESS_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="industryType">Tipo de indústria</Label>
          <NativeSelect id="industryType" name="industryType" defaultValue="knowledge_business" required>
            {INDUSTRY_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">País de operação</Label>
        <NativeSelect id="country" name="country" defaultValue="BR" required>
          {COUNTRIES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>
            <fieldset className="space-y-2 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Endereço comercial (opcional)</legend>
        <p className="text-xs text-muted-foreground">Usado pela Whop para imposto e verificação de endereço.</p>
        <Input id="addressLine1" name="addressLine1" placeholder="Rua e número" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input id="addressCity" name="addressCity" placeholder="Cidade" />
          <Input id="addressState" name="addressState" placeholder="Estado/UF" />
          <Input id="addressPostalCode" name="addressPostalCode" placeholder="CEP/ZIP" />
        </div>
      </fieldset>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Criando loja…" : "Criar minha loja"}
      </Button>
    </form>
  );
}
