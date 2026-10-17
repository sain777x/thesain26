import { z } from "zod";
import {
  CURRENCIES,
  DELIVERY_METHODS,
  PRODUCT_TYPES,
} from "@/lib/business";

const productTypeValues = PRODUCT_TYPES.map((item) => item.value) as [
  (typeof PRODUCT_TYPES)[number]["value"],
  ...(typeof PRODUCT_TYPES)[number]["value"][],
];
const deliveryValues = DELIVERY_METHODS.map((item) => item.value) as [
  (typeof DELIVERY_METHODS)[number]["value"],
  ...(typeof DELIVERY_METHODS)[number]["value"][],
];
const currencyValues = CURRENCIES.map((item) => item.value) as [
  (typeof CURRENCIES)[number]["value"],
  ...(typeof CURRENCIES)[number]["value"][],
];

export const productPriceSchema = z.object({
  label: z.string().trim().max(60).optional().default(""),
  amount: z.number().min(1).max(10000),
});

export const productBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  subtitle: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(8000).optional().default(""),
  productType: z.enum(productTypeValues).optional().default("outro"),
  deliveryMethod: z.enum(deliveryValues).optional().default("manual"),
  price: z.number().min(1).max(10000),
  currency: z.enum(currencyValues).optional().default("usd"),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  slug: z.string().trim().max(48).optional().default(""),
  status: z.enum(["active", "draft"]).optional(),
  active: z.boolean().optional(),
  prices: z.array(productPriceSchema).max(5).optional().default([]),
});

export type ProductBody = z.infer<typeof productBodySchema>;

export function productStatus(body: { status?: "active" | "draft"; active?: boolean }) {
  if (body.status) return body.status;
  if (body.active === false) return "draft" as const;
  return "active" as const;
}
