import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayoutDesk } from "@/components/payout-desk";
import { formatMoney } from "@/lib/format";
import { requireSeller } from "@/lib/guards";
import {
  getAccountBalance,
  listPayoutHistory,
  listPayoutMethods,
  whopErrorMessage,
} from "@/lib/whop";

export const dynamic = "force-dynamic";

export default async function SaldoPage() {
  const user = await requireSeller();
  let balanceError: string | null = null;
  let balance: Awaited<ReturnType<typeof getAccountBalance>> | null = null;
  let methods: Awaited<ReturnType<typeof listPayoutMethods>> = [];
  let history: Awaited<ReturnType<typeof listPayoutHistory>> = [];

  if (user.whopBizId) {
    const [balanceResult, methodsResult, historyResult] = await Promise.allSettled([
      getAccountBalance(user.whopBizId, user.whopApiKey),
      listPayoutMethods(user.whopBizId, user.whopApiKey),
      listPayoutHistory(user.whopBizId, user.whopApiKey),
    ]);
    if (balanceResult.status === "fulfilled") balance = balanceResult.value;
    else balanceError = whopErrorMessage(balanceResult.reason);
    if (methodsResult.status === "fulfilled") methods = methodsResult.value;
    else balanceError = balanceError ?? whopErrorMessage(methodsResult.reason);
    if (historyResult.status === "fulfilled") history = historyResult.value;
    else balanceError = balanceError ?? whopErrorMessage(historyResult.reason);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Recebimentos</p>
        <h1 className="text-4xl">Saldo e saques</h1>
      </div>

      {balanceError ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {balanceError}
        </p>
      ) : null}

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
            <CardTitle>Pendente · dia seguinte</CardTitle>
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

      <PayoutDesk
        connected={Boolean(user.whopBizId)}
        currency={balance?.currency ?? "usd"}
        available={balance?.available ?? 0}
        methods={methods}
        history={history}
      />
    </div>
  );
}
