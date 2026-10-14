import {
  CURRENCIES,
  DELIVERY_METHODS,
  PRODUCT_TYPES,
  type CurrencyCode,
  type DeliveryMethod,
  type ProductType,
} from "@/lib/business";
import { productBodySchema, type ProductBody } from "@/lib/product-schema";
import { slugify } from "@/lib/slug";

const productTypes = new Set<string>(PRODUCT_TYPES.map((item) => item.value));
const deliveries = new Set<string>(DELIVERY_METHODS.map((item) => item.value));
const currencies = new Set<string>(CURRENCIES.map((item) => item.value));

export function draftProductFromPrompt(prompt: string) {
  const text = prompt.trim();
  if (text.length < 8) {
    throw new Error("Descreva o produto com um pouco mais de detalhe, incluindo o preço.");
  }
  if (text.length > 6000) {
    throw new Error("O texto passou de 6.000 caracteres.");
  }
  return text;
}

export async function generateProductDraft(prompt: string): Promise<ProductBody> {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error("A chave da IA não está configurada. Defina XAI_API_KEY.");
  }
  const text = draftProductFromPrompt(prompt);
  const model = process.env.XAI_MODEL || "grok-3-mini";
  const response = await fetch(process.env.XAI_URL || "https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Você monta um produto digital para a thesain26 a partir de um texto livre.",
            "Responda apenas com um objeto JSON.",
            "Campos: name, subtitle, description, productType, deliveryMethod, price, currency, slug, status, prices.",
            `productType: ${[...productTypes].join(", ")}.`,
            `deliveryMethod: ${[...deliveries].join(", ")}.`,
            `currency: ${[...currencies].join(", ")}.`,
            "status: active ou draft. Use active, salvo se o texto pedir rascunho.",
            "O preço tem de ser exatamente o número escrito no texto. Não arredonde e não invente outro valor.",
            "R$, real ou reais = brl. US$, USD ou dólar = usd. € ou euro = eur. Se a moeda não aparecer, use usd.",
            "Se houver mais de um preço, o principal vai em price e os demais em prices, cada um com label e amount.",
            "prices tem no máximo 5 itens. Não repita o preço principal.",
            "name até 80 caracteres. subtitle até 140. description é o texto de venda, no mesmo idioma do prompt, até 4000 caracteres.",
            "slug em minúsculas, com hífens, sem acento, até 48 caracteres.",
            "Não invente imageUrl. Não inclua campos fora dessa lista.",
            "Se o texto não tiver preço, use price 0.",
          ].join(" "),
        },
        { role: "user", content: text },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || "A IA não respondeu.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("A IA não devolveu o produto.");

  const parsed = parseModelJson(content);
  const price = numberValue(parsed.price);
  if (price == null || price <= 0) {
    throw new Error("Inclua o preço no texto. Exemplo: mentoria de 4 encontros por R$ 497.");
  }
  if (price > 10000) {
    throw new Error("O preço no texto passa de 10.000. Use um valor até esse limite.");
  }

  const currency = pick(parsed.currency, currencies, "usd") as CurrencyCode;
  const extras = Array.isArray(parsed.prices) ? parsed.prices : [];
  const draft = {
    name: clip(parsed.name, 80) || "Produto",
    subtitle: clip(parsed.subtitle, 140),
    description: clip(parsed.description, 4000),
    productType: pick(parsed.productType, productTypes, "outro") as ProductType,
    deliveryMethod: pick(parsed.deliveryMethod, deliveries, "manual") as DeliveryMethod,
    price,
    currency,
    imageUrl: "",
    slug: slugify(String(parsed.slug || parsed.name || "produto")).slice(0, 48),
    status: parsed.status === "draft" ? "draft" : "active",
    prices: extras
      .map((item) => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          label: clip(row.label, 60),
          amount: numberValue(row.amount) ?? 0,
        };
      })
      .filter((item) => item.amount >= 1 && item.amount <= 10000 && item.amount !== price)
      .slice(0, 5),
  };

  const result = productBodySchema.safeParse(draft);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "O produto gerado não passou na validação.";
    throw new Error(message);
  }
  return result.data;
}

function parseModelJson(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("A IA devolveu um texto que não é um produto.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A IA devolveu um formato inesperado.");
  }
  return parsed as Record<string, unknown>;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const parsed = Number(normalized.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function pick(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}
