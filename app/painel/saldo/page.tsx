import { redirect, unstable_rethrow } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountLinkButton } from "@/components/account-link-button";
import { PayoutPortalLoader } from "@/components/payout-portal-loader";
import { appUrl } from "@/lib/app-url";
import { formatMoney, kycLabel } from "@/lib/format";
import { requireSeller } from "@/lib/guards";
import { createAccountLink, getAccountBalance, whopErrorMessage } from "@/lib/whop";

export const dynamic = "force-dynamic";

export default async function SaldoPage({
  searchParams,
}: {
  searchParams: Promise<{ payouts?: string }>;
}) {
  const user = await requireSeller();
  const { payouts } = await searchParams;
  let balanceError: string | null = null;
  let balance: Awaited<ReturnType<typeof getAccountBalance>> | null = null;

  if (payouts === "refresh" && user.whopBizId) {
    try {
      const url = await createAccountLink({
        accountId: user.whopBizId,
        useCase: "payouts_portal",
        returnUrl: `${appUrl()}/painel/saldo?payouts=return`,
        refreshUrl: `${appUrl()}/painel/saldo?payouts=refresh`,
      });
      redirect(url);
    } catch (error) {
      unstable_rethrow(error);
      balanceError = whopErrorMessage(error);
    }
  }

  if (user.whopBizId) {
    try {
      balance = await getAccountBalance(user.whopBizId);
    } catch (error) {
      balanceError = whopErrorMessage(error);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Whop</p>
        <h1 className="text-4xl">Saldo e saques</h1>
      </div>

      {balanceError ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {balanceError}
        </p>
      ) : null}

      {!user.whopBizId ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Conecte a conta Whop no painel antes de ver o saldo.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Disponível</CardTitle>
              </CardHeader>
              <CardContent className="font-heading text-3xl">
                {balance ? formatMoney(balance.available, balance.currency) : "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Pendente</CardTitle>
              </CardHeader>
              <CardContent className="font-heading text-3xl">
                {balance ? formatMoney(balance.pending, balance.currency) : "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>KYC</CardTitle>
              </CardHeader>
              <CardContent className="text-lg">{kycLabel(user.kycStatus)}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Portal embutido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O saldo abaixo vem do BalanceElement da Whop, autenticado com um
                access token da sua connected account. Para cadastrar conta
                bancária e sacar, abra o portal hospedado.
              </p>
              <PayoutPortalLoader accountId={user.whopBizId} />
              <AccountLinkButton useCase="payouts_portal" variant="outline">
                Abrir portal de saques
              </AccountLinkButton>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
