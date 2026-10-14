"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProductValues = {
  id?: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
};

export function ProductForm({ product }: { product?: ProductValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = Boolean(product?.id);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      price: Number(form.get("price") ?? 0),
      imageUrl: String(form.get("imageUrl") ?? ""),
      active: form.get("active") === "on",
    };
    const response = await fetch(
      editing ? `/api/products/${product?.id}` : "/api/products",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Não foi possível salvar o produto.");
      setPending(false);
      return;
    }
    router.push("/painel/produtos");
    router.refresh();
  }

  async function remove() {
    if (!product?.id) return;
    if (!window.confirm("Remover este produto da loja?")) return;
    setPending(true);
    const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Não foi possível remover.");
      setPending(false);
      return;
    }
    router.push("/painel/produtos");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={product?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={product?.description}
          className="min-h-28"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">Preço (USD)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={1}
            step="0.01"
            defaultValue={product?.price ?? 10}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imageUrl">URL da imagem</Label>
          <Input
            id="imageUrl"
            name="imageUrl"
            defaultValue={product?.imageUrl}
            placeholder="https://"
          />
        </div>
      </div>
      {editing ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={product?.active ?? true}
            className="size-4 accent-primary"
          />
          À venda na loja
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Ao salvar, a thesain26 cria uma Checkout Configuration na Whop na conta
        do vendedor, com a comissão da plataforma em application_fee_amount.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Salvando…" : editing ? "Salvar produto" : "Criar produto"}
        </Button>
        {editing ? (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending}
            onClick={remove}
          >
            Remover
          </Button>
        ) : null}
      </div>
    </form>
  );
}
