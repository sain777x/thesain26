import { prisma } from "@/lib/prisma";

export type KeyAccount = {
  id: string;
  email: string;
  kind: "mae" | "sub";
  status: string;
  available: number;
  pending: number;
  reserve: number;
  releases: { date: string; amount: number }[];
  pendencies: string[];
  localUserId: string | null;
  sales: number;
  feeOverride: number | null;
};

export type KeyGroup = {
  id: string;
  apiKey: string;
  error: string | null;
  mother: KeyAccount | null;
  subs: KeyAccount[];
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function whopGet(apiKey: string, path: string) {
  const response = await fetch(`https://api.whop.com/api/v1${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Whop recusou a leitura (${response.status}).`);
  }
  return response.json() as Promise<any>;
}

function asAccount(detail: any, local: Map<string, { id: string; sales: number; feeOverride: number | null }>): KeyAccount {
  const balances = detail.balances || [];
  const token =
    balances.find((item: any) => String(item.symbol || item.currency || "").toUpperCase() === "USD") ||
    balances[0];
  const breakdown = token?.breakdown || {};
  const releases = (breakdown.pending_settlements || [])
    .map((item: any) => ({ date: String(item.date || ""), amount: num(item.amount) }))
    .filter((item: { date: string; amount: number }) => item.date && item.amount > 0);
  return {
    id: detail.id,
    email: detail.email || detail.title || detail.id,
    kind: detail.parent_account ? "sub" : "mae",
    status: detail.status || "unknown",
    available: num(breakdown.available),
    pending: num(breakdown.pending),
    reserve: num(breakdown.reserve),
    releases,
    pendencies: (detail.required_actions || [])
      .map((action: any) => action.title || action.action)
      .filter(Boolean),
    localUserId: local.get(detail.id)?.id ?? null,
    sales: local.get(detail.id)?.sales ?? 0,
    feeOverride: local.get(detail.id)?.feeOverride ?? null,
  };
}

async function readKey(apiKey: string, local: Map<string, { id: string; sales: number; feeOverride: number | null }>) {
  const listed = await whopGet(apiKey, "/accounts?limit=100");
  const ids = (listed.data || []).map((item: any) => item.id).filter(Boolean) as string[];
  const details: any[] = [];
  for (let index = 0; index < ids.length; index += 4) {
    const slice = ids.slice(index, index + 4);
    const batch = await Promise.all(
      slice.map(async (id) => {
        try {
          return await whopGet(apiKey, `/accounts/${id}`);
        } catch {
          return null;
        }
      }),
    );
    details.push(...batch.filter(Boolean));
  }
  const accounts = details
    .map((detail) => asAccount(detail, local))
    .filter((account) => account.status.toLowerCase() !== "suspended");
  const mother = accounts.find((account) => account.kind === "mae") ?? null;
  const subs = accounts
    .filter((account) => account.kind === "sub")
    .sort((left, right) => left.email.localeCompare(right.email));
  return { mother, subs, error: null as string | null };
}

export async function loadKeyGroups(): Promise<KeyGroup[]> {
  const [keys, users] = await Promise.all([
    prisma.whopKey.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      where: { whopBizId: { not: null } },
      select: {
        id: true,
        whopBizId: true,
        feePercentOverride: true,
        _count: { select: { sales: true } },
      },
    }),
  ]);
  const local = new Map(
    users
      .filter((user) => user.whopBizId)
      .map((user) => [
        user.whopBizId as string,
        { id: user.id, sales: user._count.sales, feeOverride: user.feePercentOverride },
      ]),
  );
  const groups: KeyGroup[] = [];
  for (const key of keys) {
    try {
      const read = await readKey(key.apiKey, local);
      groups.push({ id: key.id, apiKey: key.apiKey, ...read });
    } catch (error) {
      groups.push({
        id: key.id,
        apiKey: key.apiKey,
        error: error instanceof Error ? error.message : "Não foi possível ler esta key.",
        mother: null,
        subs: [],
      });
    }
  }
  return groups;
}
