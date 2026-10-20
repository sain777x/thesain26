import { NextRequest, NextResponse } from "next/server";

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

      results.push({
        id: detail.id,
        email: detail.email || detail.title || detail.name,
        status: detail.status,
        total_earned: detail.total_earned_usd || 0,
        balance: detail.total_usd || 0,
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
