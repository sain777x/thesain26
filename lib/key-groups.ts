import { prisma } from "@/lib/prisma";

export type KeyAccount = {
  id: string;
  name: string;
  email: string;
  kind: "mae" | "sub";
  status: string;
  available: number;
  pending: number;
  reserve: number;
  withdrawn: number | null;
  withdrawing: number;
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

const OPEN_PAYOUT = new Set(["requested", "in_review", "processing"]);

async function sumPayouts(apiKey: string, accountId: string) {
  let withdrawn = 0;
  let withdrawing = 0;
  let after = "";
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ account_id: accountId, first: "50" });
    if (after) query.set("after", after);
    const body = await whopGet(apiKey, `/payouts?${query.toString()}`);
    for (const item of body.data || []) {
      const amount = num(item.amount);
      if (item.status === "completed") withdrawn += amount;
      else if (OPEN_PAYOUT.has(String(item.status || ""))) withdrawing += amount;
    }
    const info = body.page_info || {};
    if (!info.has_next_page || !info.end_cursor) break;
    after = String(info.end_cursor);
  }
  return { withdrawn, withdrawing };
}

async function attachPayouts(apiKey: string, accounts: KeyAccount[]) {
  for (let index = 0; index < accounts.length; index += 4) {
    const slice = accounts.slice(index, index + 4);
    await Promise.all(
      slice.map(async (account) => {
        try {
          const totals = await sumPayouts(apiKey, account.id);
          account.withdrawn = totals.withdrawn;
          account.withdrawing = totals.withdrawing;
        } catch {
          account.withdrawn = null;
          account.withdrawing = 0;
        }
      }),
    );
  }
}

function asAccount(detail: any, local: Map<string, LocalAccount>): KeyAccount {
  const balances = detail.balances || [];
  const token =
    balances.find((item: any) => String(item.symbol || item.currency || "").toUpperCase() === "USD") ||
    balances[0];
  const breakdown = token?.breakdown || {};
  const releases = (breakdown.pending_settlements || [])
    .map((item: any) => ({ date: String(item.date || ""), amount: num(item.amount) }))
    .filter((item: { date: string; amount: number }) => item.date && item.amount > 0);
  const email = detail.email || detail.title || detail.id;
  const linked = local.get(detail.id);
  const name = [detail.title, linked?.name].find(
    (value) => value && value !== email && value !== detail.id,
  ) || "";
  return {
    id: detail.id,
    name,
    email,
    kind: detail.parent_account ? "sub" : "mae",
    status: detail.status || "unknown",
    available: num(breakdown.available),
    pending: num(breakdown.pending),
    reserve: num(breakdown.reserve),
    withdrawn: null,
    withdrawing: 0,
    releases,
    pendencies: (detail.required_actions || [])
      .map((action: any) => action.title || action.action)
      .filter(Boolean),
    localUserId: linked?.id ?? null,
    sales: linked?.sales ?? 0,
    feeOverride: linked?.feeOverride ?? null,
  };
}

type LocalAccount = { id: string; name: string; sales: number; feeOverride: number | null };

async function readKey(apiKey: string, local: Map<string, LocalAccount>) {
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
  await attachPayouts(apiKey, accounts);
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
        name: true,
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
        { id: user.id, name: user.name, sales: user._count.sales, feeOverride: user.feePercentOverride },
      ]),
  );
  const groups: KeyGroup[] = [];
  for (const key of keys) {
    try {
      const read = await readKey(key.apiKey, local);
      const seen = new Set([read.mother?.id, ...read.subs.map((account) => account.id)].filter(Boolean));
      const extra: KeyAccount[] = [];
      for (const user of users) {
        if (user.whopApiKey !== key.apiKey || !user.whopBizId || seen.has(user.whopBizId)) continue;
        const account: KeyAccount = {
          id: user.whopBizId,
          name: user.name && user.name !== user.email ? user.name : "",
          email: user.email,
          kind: "sub",
          status: user.accountStatus || "active",
          available: 0,
          pending: 0,
          reserve: 0,
          withdrawn: null,
          withdrawing: 0,
          releases: [],
          pendencies: [],
          localUserId: user.id,
          sales: user._count.sales,
          feeOverride: user.feePercentOverride,
        };
        extra.push(account);
        read.subs.push(account);
      }
      await attachPayouts(key.apiKey, extra);
      read.subs.sort((left, right) => left.email.localeCompare(right.email));
      groups.push({ id: key.id, apiKey: key.apiKey, ...read });
    } catch (error) {
      const subs = users
        .filter((user) => user.whopApiKey === key.apiKey && user.whopBizId)
        .map((user) => ({
          id: user.whopBizId as string,
          name: user.name && user.name !== user.email ? user.name : "",
          email: user.email,
          kind: "sub" as const,
          status: user.accountStatus || "active",
          available: 0,
          pending: 0,
          reserve: 0,
          withdrawn: null,
          withdrawing: 0,
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
