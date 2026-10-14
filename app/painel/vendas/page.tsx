import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { buttonVariants } from "@/components/ui/button";
import { ReloadAction } from "@/components/reload-action";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, saleStatusLabel } from "@/lib/format";
import { saleFilters, saleWhere } from "@/lib/sales-query";
import { syncSellerSales } from "@/lib/sales-sync";
import { whopErrorMessage } from "@/lib/whop";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; status?: string }>;
}) {
  const user = await requireSeller();
  const filters = saleFilters(await searchParams);
  let syncWarning: string | null = null;

  if (user.whopBizId) {
    try {
      await syncSellerSales(user.whopBizId);
    } catch (error) {
      syncWarning = whopErrorMessage(error);
    }
  }

  const sales = await prisma.sale.findMany({
    where: saleWhere(user.id, filters),
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  const exportHref = `/api/sales/export?periodo=${filters.periodo}&status=${filters.status}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Pagamentos</p>
          <h1 className="text-4xl">Vendas</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportHref} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
            Exportar CSV
          </a>
          <ReloadAction href="/api/whop/sync-sales">Sincronizar agora</ReloadAction>
        </div>
      </div>

      {syncWarning ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          A lista local está visível, mas a Whop não sincronizou agora: {syncWarning}
        </p>
      ) : null}

      <form className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Período</span>
          <NativeSelect name="periodo" defaultValue={filters.periodo}>
            <option value="todos">Todo o período</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </NativeSelect>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <NativeSelect name="status" defaultValue={filters.status}>
            <option value="todos">Todos</option>
            <option value="paid">Paga</option>
            <option value="pending">Pendente</option>
            <option value="failed">Falhou</option>
            <option value="refunded">Reembolsada</option>
          </NativeSelect>
        </label>
        <button type="submit" className={cn(buttonVariants(), "h-10 self-end")}>
          Filtrar
        </button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Registradas pelo webhook e pela sincronização</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-10 text-center">
              <p className="font-heading text-2xl">Nenhuma venda neste filtro</p>
              <p className="mt-2 text-sm text-muted-foreground">
                A lista atualiza sozinha ao abrir a página. O webhook grava na hora;
                esta visita puxa o que a Whop já tiver. As colunas são data, produto,
                comprador, valor, comissão da plataforma e status.
              </p>
              <Link href="/painel/produtos/novo" className="mt-4 inline-block text-sm underline">
                Criar um produto
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Data</th>
                    <th className="py-2 font-medium">Produto</th>
                    <th className="py-2 font-medium">Comprador</th>
                    <th className="py-2 font-medium">Valor</th>
                    <th className="py-2 font-medium">Comissão da plataforma</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t">
                      <td className="py-3">{formatDate(sale.createdAt)}</td>
                      <td className="py-3">{sale.product?.name ?? "—"}</td>
                      <td className="py-3">{sale.buyerEmail ?? "—"}</td>
                      <td className="py-3">{formatMoney(sale.amount, sale.currency)}</td>
                      <td className="py-3">{formatMoney(sale.applicationFee, sale.currency)}</td>
                      <td className="py-3">{saleStatusLabel(sale.status)}</td>
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
