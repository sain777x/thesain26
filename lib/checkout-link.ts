import { headers } from "next/headers";
import { appUrl } from "@/lib/app-url";

/** Origem da requisição atual, para o link copiável no host em que o vendedor está. */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return appUrl();
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}

/** Checkout estável da thesain26. A página abre a configuração já salva na Whop. */
export function checkoutPath(productId: string) {
  return `/checkout/${productId}`;
}

export function checkoutShareUrl(origin: string, productId: string) {
  return `${origin}${checkoutPath(productId)}`;
}
