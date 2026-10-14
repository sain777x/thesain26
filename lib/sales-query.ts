import type { Prisma } from "@prisma/client";

export const SALE_PERIODS = ["7", "30", "90", "todos"] as const;
export const SALE_STATUSES = ["todos", "paid", "pending", "failed", "refunded"] as const;

export function saleFilters(input: { periodo?: string; status?: string }) {
  const periodo = SALE_PERIODS.includes(input.periodo as (typeof SALE_PERIODS)[number])
    ? (input.periodo as (typeof SALE_PERIODS)[number])
    : "todos";
  const status = SALE_STATUSES.includes(input.status as (typeof SALE_STATUSES)[number])
    ? (input.status as (typeof SALE_STATUSES)[number])
    : "todos";
  return { periodo, status };
}

export function saleWhere(
  sellerId: string,
  filters: { periodo: string; status: string },
): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = { sellerId };
  if (filters.status !== "todos") where.status = filters.status;
  const days =
    filters.periodo === "7" ? 7 : filters.periodo === "30" ? 30 : filters.periodo === "90" ? 90 : null;
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    where.createdAt = { gte: since };
  }
  return where;
}
