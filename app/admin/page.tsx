import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteKeyButton, FeeForm, SellerFeeForm } from "@/components/admin-forms";
import { formatDate, formatMoney, formatRelease } from "@/lib/format";
import { loadKeyGroups, type KeyAccount } from "@/lib/key-groups";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function statusLabel(status: string) {
  if (status === "active") return "Ativa";
  if (status === "suspended") return "Suspensa";
  return status || "Sem status";
}

function releaseText(account: KeyAccount) {
  if (account.pending <= 0) return "—";
  if (account.releases.length === 0) return "Data não informada";
  return account.releases
    .map((item) => `${formatMoney(item.amount)} em ${formatRelease(item.date) ?? item.date}`)
    .join(" · ");
}

function AccountRow({ account }: { account: KeyAccount }) {
  return (
    <tr className={account.kind === "mae" ? "border-t bg-muted/40" : "border-t"}>
      <td className="px-3 py-3">
        {account.name ? <p className="font-medium">{account.name}</p> : null}
        <p>{account.email}</p>
        <p className="font-mono text-xs text-muted-foreground">{account.id}</p>
      </td>
      <td className="px-3 py-3">
        <Badge variant={account.kind === "mae" ? "default" : "outline"}>
          {account.kind === "mae" ? "Mãe" : "Sub-conta"}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <Badge variant={account.status === "active" ? "default" : "destructive"}>
          {statusLabel(account.status)}
        </Badge>
      </td>
      <td className="px-3 py-3">{formatMoney(account.available)}</td>
      <td className="px-3 py-3">{formatMoney(account.pending)}</td>
      <td className="px-3 py-3 text-xs">{releaseText(account)}</td>
      <td className="px-3 py-3">{formatMoney(account.reserve)}</td>
      <td className="px-3 py-3 text-xs">
        {account.pendencies.length === 0 ? "Nenhuma" : account.pendencies.join(" · ")}
      </td>
      <td className="px-3 py-3">
        {account.localUserId ? (
          <SellerFeeForm sellerId={account.localUserId} override={account.feeOverride} />
        ) : (
          <span className="text-xs text-muted-foreground">Fora do site</span>
        )}
      </td>
    </tr>
  );
}

export default async function AdminPage() {
  const [settings, sales, totals, groups] = await Promise.all([
    getPlatformSettings(),
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
    loadKeyGroups(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl">thesain26</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keys cadastradas, conta mãe e sub-contas. Saldo disponível, pendente,
          reserva e o que a Whop ainda pede.
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

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Nenhuma key cadastrada.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const rows = [...(group.mother ? [group.mother] : []), ...group.subs];
          return (
            <Card key={group.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="font-mono text-base break-all">{group.apiKey}</CardTitle>
                  <DeleteKeyButton id={group.id} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {group.mother ? group.mother.email : "Conta mãe não encontrada"} ·{" "}
                  {group.subs.length} sub-conta(s)
                </p>
              </CardHeader>
              <CardContent>
                {group.error ? <p className="mb-3 text-sm text-destructive">{group.error}</p> : null}
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma conta nesta key.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left text-sm">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Conta</th>
                          <th className="px-3 py-2 font-medium">Tipo</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Disponível</th>
                          <th className="px-3 py-2 font-medium">Pendente</th>
                          <th className="px-3 py-2 font-medium">Libera</th>
                          <th className="px-3 py-2 font-medium">Reserva</th>
                          <th className="px-3 py-2 font-medium">Pendências</th>
                          <th className="px-3 py-2 font-medium">Comissão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((account) => (
                          <AccountRow key={account.id} account={account} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vendas recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
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
