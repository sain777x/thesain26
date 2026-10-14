"use client";

import dynamic from "next/dynamic";

const PayoutPortal = dynamic(
  () => import("@/components/payout-portal").then((mod) => mod.PayoutPortal),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Carregando portal de saldo…</p>
    ),
  },
);

export function PayoutPortalLoader({ accountId }: { accountId: string }) {
  return <PayoutPortal accountId={accountId} />;
}
