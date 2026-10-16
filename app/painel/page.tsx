import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesChart, buildSalesSeries } from "@/components/sales-chart";
import { ReloadAction } from "@/components/reload-action";
import { appUrl } from "@/lib/app-url";
import { formatMoney, saleStatusLabel, sellerAccountLabel } from "@/lib/format";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { feePercentFor } from "@/lib/platform";
import { syncSellerSales } from "@/lib/sales-sync";
import {
  createAccountLink,
  getAccountBalance,
  syncKycStatus,
  syncOperatingStatus,
  whopErrorMessage,
} from "@/lib/whop";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; aviso?: string; dias?: string }>;
}) {
  const query = await searchParams;
  let user = await requireSeller();
  let linkError: string | null = null;
  const days = query.dias === "30" ? 30 : 7;

  if (query.onboarding === "refresh" && user.whopBizId) {
    try {
      const url = await createAccountLink({
        accountId: user.whopBizId,
        useCase: "account_onboarding",
        returnUrl: `${appUrl()}/painel/verificacoes?onboarding=return`,
        refreshUrl: `${appUrl()}/painel/verificacoes?onboarding=refresh`,
      });
      redirect(url);
    } catch (error) {
      unstable_rethrow(error);
      linkError = whopErrorMessage(error);
    }
  }

  if ((query.onboarding === "return" || query.onboarding === "complete") && user.whopBizId) {
    try {
      const snapshot = await syncKycStatus(user.whopBizId);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          kycStatus: snapshot.status,
          kycDetail: snapshot.detail,
          kycCheckedAt: new Date(),
        },
        include: { store: true },
      });
    } catch (error) {
      linkError = whopErrorMessage(error);
    }
  }

  let balance: Awaited<ReturnType<typeof getAccountBalance>> | null = null;
  if (user.whopBizId) {
    const [salesSync, kycSync, statusSync, balanceSync] = await Promise.allSettled([
      syncSellerSales(user.whopBizId),
      syncKycStatus(user.whopBizId),
      syncOperatingStatus(user.whopBizId),
      getAccountBalance(user.whopBizId),
    ]);
    if (balanceSync.status === "fulfilled") balance = balanceSync.value;
    else linkError = linkError ?? whopErrorMessage(balanceSync.reason);

    const nextKyc = kycSync.status === "fulfilled" ? kycSync.value : null;
    const nextStatus = statusSync.status === "fulfilled" ? statusSync.value : user.accountStatus;
    if (kycSync.status === "rejected" && !linkError) {
      linkError = whopErrorMessage(kycSync.reason);
    }
    if (statusSync.status === "rejected" && !linkError) {
      linkError = whopErrorMessage(statusSync.reason);
    }
    const kycChanged = Boolean(
      nextKyc &&
        (nextKyc.status !== user.kycStatus || nextKyc.detail !== user.kycDetail),
    );
    if (kycChanged || nextStatus !== user.accountStatus) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(nextKyc
            ? {
                kycStatus: nextKyc.status,
                kycDetail: nextKyc.detail,
                kycCheckedAt: new Date(),
              }
            : {}),
          accountStatus: nextStatus,
        },
        include: { store: true },
      });
    }
    if (salesSync.status === "rejected" && !linkError) {
      linkError = whopErrorMessage(salesSync.reason);
    }
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const [feePercent, totals, recent, chartSales, productCount] = await Promise.all([
    feePercentFor(user),
    prisma.sale.aggregate({
      where: { sellerId: user.id, status: "paid" },
      _sum: { amount: true, applicationFee: true },
      _count: true,
    }),
    prisma.sale.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { product: true },
    }),
    prisma.sale.findMany({
      where: { sellerId: user.id, status: "paid", createdAt: { gte: since } },
      select: { createdAt: true, amount: true },
    }),
    prisma.product.count({ where: { sellerId: user.id, active: true } }),
  ]);

  const revenue = totals._sum.amount ?? 0;
  const commission = totals._sum.applicationFee ?? 0;
  const accountLabel = sellerAccountLabel(user.kycStatus, user.accountStatus);
  const chart = buildSalesSeries(chartSales, days);
  const storeHref = user.store ? `/loja/${user.store.slug}` : "/painel/loja";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Painel do vendedor</p>
          <h1 className="text-4xl">Olá, {user.name.split(" ")[0]}</h1>
        </div>
        <Badge variant={accountLabel === "Ativa" ? "default" : "outline"}>{accountLabel}</Badge>
      </div>

      {query.aviso ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          A conta foi criada, mas a Whop não conectou agora: {query.aviso}
        </p>
      ) : null}
      {linkError ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {linkError}
        </p>
      ) : null}

      {!user.whopBizId ? (
        <Card>
          <CardHeader>
            <CardTitle>Conectar conta Whop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              O cadastro não conseguiu criar a connected account. Sem ela não há
              KYC, checkout nem saque.
            </p>
            <ReloadAction href="/api/whop/connect">Conectar agora</ReloadAction>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Saldo disponível</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">
            {balance ? formatMoney(balance.available, balance.currency) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saldo pendente</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">
            {balance ? formatMoney(balance.pending, balance.currency) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total de vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl">{formatMoney(revenue)}</p>
            <p className="text-xs text-muted-foreground">
              {totals._count} {totals._count === 1 ? "venda paga" : "vendas pagas"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comissão retida</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl">{formatMoney(commission)}</p>
            <p className="text-xs text-muted-foreground">
              {feePercent}% em cada venda · {productCount} produtos ativos
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Vendas dos últimos {days} dias</CardTitle>
          <div className="flex gap-2 text-sm">
            <Link href="/painel?dias=7" className={days === 7 ? "underline" : "text-muted-foreground"}>
              7 dias
            </Link>
            <Link href="/painel?dias=30" className={days === 30 ? "underline" : "text-muted-foreground"}>
              30 dias
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {chart.every((point) => point.total === 0) ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda paga neste período.
            </p>
          ) : (
            <SalesChart points={chart} currency="usd" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/painel/produtos/novo" className={cn(buttonVariants(), "h-10")}>
          Criar produto
        </Link>
        <Link href={storeHref} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
          Ver loja
        </Link>
        <Link href="/painel/verificacoes" className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
          Verificações
        </Link>
        <Link href="/painel/saldo" className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
          Adicionar payout
        </Link>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Vendas recentes</CardTitle>
          <Link href="/painel/vendas" className="text-sm underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda ainda. Publique um produto e compartilhe a loja.
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((sale) => (
                <li key={sale.id} className="py-3 text-sm">
                  <Link href={`/painel/vendas/${sale.id}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{sale.product?.name ?? "Produto"}</span>
                  <span className="shrink-0">
                    {formatMoney(sale.amount, sale.currency)} · {saleStatusLabel(sale.status)}
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
