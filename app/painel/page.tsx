import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountLinkButton } from "@/components/account-link-button";
import { ReloadAction } from "@/components/reload-action";
import { appUrl } from "@/lib/app-url";
import { formatMoney, kycLabel } from "@/lib/format";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { feePercentFor } from "@/lib/platform";
import { createAccountLink, syncKycStatus, whopErrorMessage } from "@/lib/whop";

export const dynamic = "force-dynamic";

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; aviso?: string }>;
}) {
  const query = await searchParams;
  let user = await requireSeller();
  let linkError: string | null = null;

  if (query.onboarding === "refresh" && user.whopBizId) {
    try {
      const url = await createAccountLink({
        accountId: user.whopBizId,
        useCase: "account_onboarding",
        returnUrl: `${appUrl()}/painel?onboarding=return`,
        refreshUrl: `${appUrl()}/painel?onboarding=refresh`,
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

  const [feePercent, sales, productCount] = await Promise.all([
    feePercentFor(user),
    prisma.sale.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { product: true },
    }),
    prisma.product.count({ where: { sellerId: user.id, active: true } }),
  ]);
  const paid = sales.filter((sale) => sale.status === "paid");
  const revenue = paid.reduce((sum, sale) => sum + sale.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Painel do vendedor</p>
        <h1 className="text-4xl">Olá, {user.name.split(" ")[0]}</h1>
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

      {user.whopBizId && user.kycStatus !== "verified" ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Completar verificação (KYC)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Status atual: {kycLabel(user.kycStatus)}
              {user.kycDetail ? ` · ${user.kycDetail}` : ""}. A Whop abre o
              fluxo oficial de onboarding. Quando terminar, você volta para este
              painel e o status é atualizado.
            </p>
            <div className="flex flex-wrap gap-2">
              <AccountLinkButton useCase="account_onboarding">
                Completar verificação (KYC)
              </AccountLinkButton>
              <ReloadAction href="/api/whop/sync-kyc" variant="outline">
                Atualizar status
              </ReloadAction>
            </div>
          </CardContent>
        </Card>
      ) : user.whopBizId ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm text-muted-foreground">Verificação</p>
              <p className="font-medium">KYC aprovado na Whop</p>
            </div>
            <Badge>Verificado</Badge>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Produtos ativos</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">{productCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendas pagas</CardTitle>
          </CardHeader>
          <CardContent className="font-heading text-3xl">
            {formatMoney(revenue)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sua comissão</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl">{feePercent}%</p>
            <p className="text-xs text-muted-foreground">
              A thesain26 retém isso em cada venda.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Vendas recentes</CardTitle>
          <Link href="/painel/vendas" className="text-sm underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda ainda. Publique um produto e compartilhe a loja.
            </p>
          ) : (
            <ul className="divide-y">
              {sales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{sale.product?.name ?? "Produto"}</span>
                  <span>
                    {formatMoney(sale.amount, sale.currency)} · {sale.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
