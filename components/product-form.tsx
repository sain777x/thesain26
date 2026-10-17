"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCIES,
  DELIVERY_METHODS,
  PRODUCT_TYPES,
} from "@/lib/business";
import { queueToast } from "@/components/toast";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ExtraPrice = { label: string; amount: string };

type ProductValues = {
  id?: string;
  name: string;
  subtitle: string;
  description: string;
  productType: string;
  deliveryMethod: string;
  price: number;
  currency: string;
  imageUrl: string;
  slug: string;
  status: string;
  prices: { label: string; amount: number }[];
};

export function ProductForm({ product }: { product?: ProductValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(product);
  const [formKey, setFormKey] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [extras, setExtras] = useState<ExtraPrice[]>(
    product?.prices.map((item) => ({
      label: item.label,
      amount: String(item.amount),
    })) ?? [],
  );
  const editing = Boolean(product?.id);

  async function generate() {
    setDrafting(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/products/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        product?: ProductValues;
      };
      if (!response.ok || !data.product) {
        throw new Error(data.error ?? "Não foi possível montar o produto.");
      }
      setDraft({ ...data.product, id: product?.id });
      setExtras(
        (data.product.prices ?? []).map((item) => ({
          label: item.label,
          amount: String(item.amount),
        })),
      );
      setFormKey((current) => current + 1);
      queueToast("Produto montado. Revise o preço e crie.");
    } catch (reason) {
      setDraftError(reason instanceof Error ? reason.message : "Não foi possível montar o produto.");
    } finally {
      setDrafting(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const prices = extras
      .map((item) => ({
        label: item.label.trim(),
        amount: Number(item.amount),
      }))
      .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
    const payload = {
      name: String(form.get("name") ?? ""),
      subtitle: String(form.get("subtitle") ?? ""),
      description: String(form.get("description") ?? ""),
      productType: String(form.get("productType") ?? "outro"),
      deliveryMethod: String(form.get("deliveryMethod") ?? "manual"),
      price: Number(form.get("price") ?? 0),
      currency: String(form.get("currency") ?? "usd"),
      imageUrl: String(form.get("imageUrl") ?? ""),
      slug: String(form.get("slug") ?? ""),
      status: String(form.get("status") ?? "active"),
      prices,
    };
    const response = await fetch(
      editing ? `/api/products/${product?.id}` : "/api/products",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      whopWarning?: string | null;
    };
    if (!response.ok) {
      setError(data.error ?? "Não foi possível salvar o produto.");
      setPending(false);
      return;
    }
    queueToast(
      data.whopWarning
        ? "Produto salvo. Alguma opção de preço não entrou na Whop."
        : "Produto salvo e checkout da Whop atualizado.",
    );
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
    queueToast("Produto removido.");
    router.push("/painel/produtos");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-dashed p-4">
        <div>
          <p className="font-medium">Criar com IA</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cole o texto do produto, com o preço. A IA preenche nome, descrição, tipo, entrega e o valor que estiver no texto.
          </p>
        </div>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Mentoria de tráfego pago, 4 encontros de 1 hora, entrega por videochamada. Preço: R$ 497."
          className="min-h-28"
        />
        {draftError ? <p className="text-sm text-destructive">{draftError}</p> : null}
        <Button type="button" variant="outline" className="h-10" disabled={drafting || pending} onClick={generate}>
          {drafting ? "Montando…" : "Montar produto"}
        </Button>
      </div>
    <form key={formKey} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome do produto</Label>
          <Input id="name" name="name" defaultValue={draft?.name} required maxLength={80} />
          <p className="text-xs text-muted-foreground">Até 80 caracteres. É o nome que aparece no checkout.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitle">Rótulo / subtítulo</Label>
          <Input id="subtitle" name="subtitle" defaultValue={draft?.subtitle} maxLength={80} />
          <p className="text-xs text-muted-foreground">Até 80 caracteres. Aparece abaixo do nome no checkout.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descrição completa</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={draft?.description}
          className="min-h-40"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="productType">Tipo de produto</Label>
          <NativeSelect
            id="productType"
            name="productType"
            defaultValue={draft?.productType ?? "outro"}
          >
            {PRODUCT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="deliveryMethod">Forma de entrega</Label>
          <NativeSelect
            id="deliveryMethod"
            name="deliveryMethod"
            defaultValue={draft?.deliveryMethod ?? "manual"}
          >
            {DELIVERY_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="price">Preço</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={1}
            step="0.01"
            defaultValue={draft?.price ?? 10}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Moeda</Label>
          <NativeSelect id="currency" name="currency" defaultValue={draft?.currency ?? "usd"}>
            {CURRENCIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={draft?.status ?? "active"}>
            <option value="active">Ativo</option>
            <option value="draft">Rascunho</option>
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-3 rounded-xl bg-muted/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Outras opções de preço</p>
          <Button
            type="button"
            variant="outline"
            className="h-8"
            onClick={() =>
              setExtras((rows) =>
                rows.length >= 5 ? rows : [...rows, { label: "", amount: "" }],
              )
            }
          >
            Adicionar preço
          </Button>
        </div>
        {extras.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O preço acima é o principal. Você pode acrescentar até cinco opções.
          </p>
        ) : (
          extras.map((extra, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <Input
                aria-label="Nome da opção"
                value={extra.label}
                placeholder="Ex.: Mentoria de 4 semanas"
                onChange={(event) =>
                  setExtras((rows) =>
                    rows.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, label: event.target.value } : row,
                    ),
                  )
                }
              />
              <Input
                aria-label="Valor da opção"
                type="number"
                min={1}
                step="0.01"
                value={extra.amount}
                onChange={(event) =>
                  setExtras((rows) =>
                    rows.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, amount: event.target.value } : row,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setExtras((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remover
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="imageUrl">Imagem do produto</Label>
          <Input
            id="imageUrl"
            name="imageUrl"
            defaultValue={draft?.imageUrl}
            placeholder="https://"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">URL personalizada</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={draft?.slug}
            placeholder="guia-de-luz"
          />
          <p className="text-xs text-muted-foreground">
            O link copiável continua /checkout/id. O slug também abre essa página.
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Ao salvar, a thesain26 cria a Checkout Configuration na Whop na conta do
        vendedor, com a comissão em application_fee_amount, e guarda plan_id e
        purchase_url. Rascunho fica fora da vitrine.
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
    </div>
  );
}
