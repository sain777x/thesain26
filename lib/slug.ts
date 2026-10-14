const RESERVED = new Set([
  "admin",
  "api",
  "cadastro",
  "login",
  "loja",
  "painel",
  "obrigado",
]);

export function slugify(input: string) {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "loja";
}

export function isReservedSlug(slug: string) {
  return RESERVED.has(slug);
}
