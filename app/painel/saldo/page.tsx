import { redirect, unstable_rethrow } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountLinkButton } from "@/components/account-link-button";
import { PayoutPortalLoader } from "@/components/payout-portal-loader";
import { appUrl } from "@/lib/app-url";
import { formatDate, formatMoney, kycReviewLabel } from "@/lib/format";
import { requireSeller } from "@/lib/guards";
import {
  createAccountLink,
  getAccountBalance,
  listPayoutHistory,
  listPayoutMethods,
  whopErrorMessage,
} from "@/lib/whop";

export const dynamic = "force-dynamic";

function methodGroup(input: { payerName: string | null; currency: string; deliveryType: string | null }) {
  const text = `${input.payerName ?? ""} ${input.deliveryType ?? ""}`.toLowerCase();
  if (text.includes("pix")) return "PIX (BRL)";
  if (text.includes("paypal")) return "PayPal";
  if (text.includes("bank") || text.includes("ach") || text.includes("wire") || text.includes("sepa")) {
    return `Transferência bancária (${input.currency.toUpperCase()})`;
  }
  return input.payerName || "Método Whop";
}

export default async function SaldoPage({
  searchParams,
}: {
  searchParams: Promise<{ payouts?: string }>;
}) {
  const user = await requireSeller();
  const { payouts } = await searchParams;
  let balanceError: string | null = null;
  let balance: Awaited<ReturnType<typeof getAccountBalance>> | null = null;
  let methods: Awaited<ReturnType<typeof listPayoutMethods>> = [];
  let history: Awaited<ReturnType<typeof listPayoutHistory>> = [];

  if (payouts === "refresh" && user.whopBizId) {
    try {
      // Portal oficial de saques. PIX, PayPal e banco são cadastrados lá.
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
    const [balanceResult, methodsResult, historyResult] = await Promise.allSettled([
      getAccountBalance(user.whopBizId),
      listPayoutMethods(user.whopBizId),
      listPayoutHistory(user.whopBizId),
    ]);
    if (balanceResult.status === "fulfilled") balance = balanceResult.value;
    else balanceError = whopErrorMessage(balanceResult.reason);
    if (methodsResult.status === "fulfilled") methods = methodsResult.value;
    else balanceError = balanceError ?? whopErrorMessage(methodsResult.reason);
    if (historyResult.status === "fulfilled") history = historyResult.value;
    else balanceError = balanceError ?? whopErrorMessage(historyResult.reason);
  }

  const rails = [
    { title: "PIX (BRL)", detail: "Saque em real pelo portal da Whop." },
    { title: "PayPal", detail: "Conta PayPal vinculada no portal de saques." },
    { title: "Transferência bancária", detail: "Disponível em BRL, USD e EUR, conforme a Whop oferecer para a conta." },
  ];

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
            Conecte a conta Whop no painel antes de ver o saldo. Os métodos abaixo
            são cadastrados no portal oficial depois dessa conexão.
          </CardContent>
        </Card>
      ) : (
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
                <CardTitle>Reserva</CardTitle>
              </CardHeader>
              <CardContent className="font-heading text-3xl">
                {balance ? formatMoney(balance.reserve, balance.currency) : "—"}
              </CardContent>
            </Card>
        </div>
      )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Métodos de pagamento</CardTitle>
              <AccountLinkButton useCase="payouts_portal" variant="outline">
                Adicionar método
              </AccountLinkButton>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {rails.map((rail) => (
                  <div key={rail.title} className="rounded-xl bg-muted/60 p-3">
                    <p className="font-medium">{rail.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{rail.detail}</p>
                  </div>
                ))}
              </div>
              {methods.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum método salvo ainda. Adicionar método abre o portal oficial
                  da Whop (payouts_portal). KYC: {kycReviewLabel(user.kycStatus)}.
                </p>
              ) : (
                <ul className="divide-y">
                  {methods.map((method) => (
                    <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span>
                        {method.nickname || methodGroup(method)}
                        {method.reference ? ` · ${method.reference}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {method.currency.toUpperCase()} · {method.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de saques</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum saque registrado na Whop para esta conta.
                </p>
              ) : (
                <ul className="divide-y">
                  {history.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span>
                        {formatDate(row.createdAt)}
                        {row.destination ? ` · ${row.destination}` : ""}
                      </span>
                      <span>
                        {formatMoney(row.amount, row.currency)} · {row.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saldo embutido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O bloco abaixo é o BalanceElement da Whop, autenticado com um access
                token da sua connected account.
              </p>
              {user.whopBizId ? <PayoutPortalLoader accountId={user.whopBizId} /> : null}
            </CardContent>
          </Card>
    </div>
  );
}
