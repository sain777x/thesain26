import { NextRequest, NextResponse } from "next/server";

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fromAccount(detail: any) {
  const balances = detail.balances || [];
  const token =
    balances.find((b: any) => String(b.symbol || b.currency || "").toUpperCase() === "USD") ||
    balances[0];
  const breakdown = token?.breakdown || {};
  return {
    available: num(breakdown.available ?? token?.balance ?? detail.total_usd ?? 0),
    pending: num(breakdown.pending),
    reserve: num(breakdown.reserve),
    payments: null as string | null,
  };
}

async function fromLedger(id: string, headers: Record<string, string>) {
  const res = await fetch(`https://api.whop.com/api/v1/ledger_accounts/${id}`, { headers });
  if (!res.ok) return null;
  const ledger = await res.json();
  const usd =
    (ledger.balances || []).find((b: any) => b.currency === "usd") ||
    (ledger.balances || [])[0];
  return {
    available: num(usd?.balance),
    pending: num(usd?.pending_balance),
    reserve: num(usd?.reserve_balance),
    payments: (ledger.payments_approval_status as string) || null,
  };
}

export async function POST(req: NextRequest) {
  const { key } = await req.json();
  if (!key || !key.startsWith("apik_")) {
    return NextResponse.json({ error: "Key inválida" }, { status: 400 });
  }

  const headers = { Authorization: `Bearer ${key}` };
  
  try {
    const accRes = await fetch("https://api.whop.com/api/v1/accounts?limit=100", { headers });
    if (!accRes.ok) {
      return NextResponse.json({ error: "Key inválida ou sem acesso" }, { status: 401 });
    }
    const accData = await accRes.json();
    const accounts = accData.data || [];

    const results = [];
    for (const acc of accounts) {
      const detailRes = await fetch(`https://api.whop.com/api/v1/accounts/${acc.id}`, { headers });
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();

      const payRes = await fetch(`https://api.whop.com/api/v1/payments?account_id=${acc.id}&limit=1`, { headers });
      const payData = payRes.ok ? await payRes.json() : { data: [] };
      if (!payData.data?.length) continue;

      const actions = (detail.required_actions || []).map((a: any) => ({
        action: a.action,
        status: a.status,
        title: a.title,
      }));

      const money = (await fromLedger(detail.id, headers)) || fromAccount(detail);

      results.push({
        id: detail.id,
        email: detail.email || detail.title || detail.name,
        status: detail.status,
        total_earned: detail.total_earned_usd || 0,
        balance: money.available,
        pending: money.pending,
        reserve: money.reserve,
        payments_approval_status: money.payments,
        balances: detail.balances || [],
        required_actions: actions,
        capabilities: detail.capabilities || {},
        created_at: detail.created_at,
      });
    }

    return NextResponse.json({ accounts: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
