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
  const rows = (listed.data || []).filter((item: any) => item?.id) as any[];
  const details: any[] = [];
  for (let index = 0; index < rows.length; index += 4) {
    const slice = rows.slice(index, index + 4);
    const batch = await Promise.all(
      slice.map(async (item) => {
        try {
          const detail = await whopGet(apiKey, `/accounts/${item.id}`);
          return { ...item, ...detail, status: detail.status || item.status || "unknown" };
        } catch {
          return {
            ...item,
            status: item.status || "unknown",
            parent_account: item.parent_account === undefined ? "lista" : item.parent_account,
          };
        }
      }),
    );
    details.push(...batch);
  }
  const accounts = details.map((detail) => asAccount(detail, local));
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
        email: true,
        whopBizId: true,
        whopApiKey: true,
        accountStatus: true,
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
      const seen = new Set([read.mother?.id, ...read.subs.map((account) => account.id)].filter(Boolean));
      for (const user of users) {
        if (user.whopApiKey !== key.apiKey || !user.whopBizId || seen.has(user.whopBizId)) continue;
        read.subs.push({
          id: user.whopBizId,
          email: user.email,
          kind: "sub",
          status: user.accountStatus || "active",
          available: 0,
          pending: 0,
          reserve: 0,
          releases: [],
          pendencies: [],
          localUserId: user.id,
          sales: user._count.sales,
          feeOverride: user.feePercentOverride,
        });
      }
      read.subs.sort((left, right) => left.email.localeCompare(right.email));
      groups.push({ id: key.id, apiKey: key.apiKey, ...read });
    } catch (error) {
      const subs = users
        .filter((user) => user.whopApiKey === key.apiKey && user.whopBizId)
        .map((user) => ({
          id: user.whopBizId as string,
          email: user.email,
          kind: "sub" as const,
          status: user.accountStatus || "active",
          available: 0,
          pending: 0,
          reserve: 0,
          releases: [] as { date: string; amount: number }[],
          pendencies: [] as string[],
          localUserId: user.id,
          sales: user._count.sales,
          feeOverride: user.feePercentOverride,
        }));
      groups.push({
        id: key.id,
        apiKey: key.apiKey,
        error: error instanceof Error ? error.message : "Não foi possível ler esta key.",
        mother: null,
        subs,
      });
    }
  }
  return groups;
}
