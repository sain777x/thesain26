import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReloadAction } from "@/components/reload-action";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VendasPage() {
  const user = await requireSeller();
  const sales = await prisma.sale.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Pagamentos</p>
          <h1 className="text-4xl">Vendas</h1>
        </div>
        <ReloadAction href="/api/whop/sync-sales">Sincronizar com a Whop</ReloadAction>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Registradas pelo webhook</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda nesta conta. O webhook /api/webhooks/whop grava o
              pagamento quando a Whop avisa. Em ambiente local, use sincronizar
              para puxar o que já existe na conta.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Produto</th>
                    <th className="py-2 font-medium">Comprador</th>
                    <th className="py-2 font-medium">Valor</th>
                    <th className="py-2 font-medium">Comissão</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t">
                      <td className="py-3">{sale.product?.name ?? "—"}</td>
                      <td className="py-3">{sale.buyerEmail ?? "—"}</td>
                      <td className="py-3">{formatMoney(sale.amount, sale.currency)}</td>
                      <td className="py-3">
                        {formatMoney(sale.applicationFee, sale.currency)}
                      </td>
                      <td className="py-3">{sale.status}</td>
                      <td className="py-3">{formatDate(sale.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
