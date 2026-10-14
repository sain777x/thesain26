import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminTreasury, type TreasuryRow } from "@/components/admin-treasury";
import { FeeForm, SellerFeeForm } from "@/components/admin-forms";
import { formatDate, formatMoney, kycLabel } from "@/lib/format";
import { loadSellerTreasury } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [settings, sellers, sales, totals] = await Promise.all([
    getPlatformSettings(),
    prisma.user.findMany({
      where: { role: "seller" },
      include: {
        store: true,
        _count: { select: { products: true, sales: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { product: true, seller: true },
    }),
    prisma.sale.aggregate({
      where: { status: "paid" },
      _sum: { applicationFee: true, amount: true },
      _count: true,
    }),
  ]);

  const treasuryRows: TreasuryRow[] = await mapPool(sellers, 4, async (seller) => ({
    id: seller.id,
    name: seller.name,
    email: seller.email,
    store: seller.store?.name ?? null,
    account: seller.whopBizId,
    treasury: seller.whopBizId ? await loadSellerTreasury(seller.whopBizId) : null,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl">thesain26</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Vendedores, verificação e a comissão que a plataforma recebe em cada
          direct charge.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Comissões recebidas</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">
            {formatMoney(totals._sum.applicationFee ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Volume pago</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">
            {formatMoney(totals._sum.amount ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendas pagas</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">{totals._count}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comissão da plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Padrão de {settings.feePercent}% em produtos novos e em cada edição.
            Um vendedor pode ter uma taxa própria.
          </p>
          <FeeForm feePercent={settings.feePercent} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldos dos vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTreasury rows={treasuryRows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {sellers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum vendedor cadastrado. A primeira loja aparece quando alguém
              cria a conta.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Vendedor</th>
                    <th className="py-2 font-medium">Loja</th>
                    <th className="py-2 font-medium">KYC</th>
                    <th className="py-2 font-medium">Conta Whop</th>
                    <th className="py-2 font-medium">Vendas</th>
                    <th className="py-2 font-medium">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller) => (
                    <tr key={seller.id} className="border-t align-top">
                      <td className="py-3">
                        <p>{seller.name}</p>
                        <p className="text-xs text-muted-foreground">{seller.email}</p>
                      </td>
                      <td className="py-3">
                        {seller.store ? (
                          <Link href={`/loja/${seller.store.slug}`} className="underline">
                            {seller.store.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={
                            seller.kycStatus === "verified" ? "default" : "outline"
                          }
                        >
                          {kycLabel(seller.kycStatus)}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-xs">
                        {seller.whopBizId ?? "sem conta"}
                      </td>
                      <td className="py-3">{seller._count.sales}</td>
                      <td className="py-3">
                        <SellerFeeForm
                          sellerId={seller.id}
                          override={seller.feePercentOverride}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendas recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda registrada. Elas entram pelo webhook da Whop.
            </p>
          ) : (
            <ul className="divide-y">
              {sales.map((sale) => (
                <li key={sale.id} className="py-3 text-sm">
                  <Link href={`/admin/vendas/${sale.id}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {sale.product?.name ?? "Produto"} · {sale.seller?.name ?? "vendedor"}
                  </span>
                  <span className="text-muted-foreground">
                    {formatMoney(sale.amount, sale.currency)} · comissão{" "}
                    {formatMoney(sale.applicationFee, sale.currency)} · {sale.status} ·{" "}
                    {formatDate(sale.createdAt)}
                  </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
