"use client";

import { useEffect, useState } from "react";
import {
  BalanceElement,
  Balances,
  Wallet,
  WhopElements,
} from "@whop/elements-react";
import { loadWhop } from "@whop/elements";

/**
 * Portal de saldo embutido com Whop Elements.
 * O token é emitido no servidor para a connected account da sessão.
 */
export function PayoutPortal({ accountId }: { accountId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whop/token")
      .then(async (response) => {
        const data = (await response.json()) as { token?: string; error?: string };
        if (!response.ok || !data.token) {
          throw new Error(data.error ?? "Não foi possível abrir o saldo.");
        }
        if (!cancelled) setToken(data.token);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!token) {
    return <p className="text-sm text-muted-foreground">Carregando saldo da Whop…</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-foreground/10">
      <WhopElements elements={loadWhop()}>
        <Wallet accountId={accountId} accessToken={token} currency="usd">
          <Balances>
            <BalanceElement />
          </Balances>
        </Wallet>
      </WhopElements>
    </div>
  );
}
