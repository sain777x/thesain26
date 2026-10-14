"use client";

import dynamic from "next/dynamic";

const WhopCheckoutEmbed = dynamic(
  () => import("@whop/checkout/react").then((mod) => mod.WhopCheckoutEmbed),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
        Abrindo o checkout da Whop…
      </div>
    ),
  },
);

export function CheckoutEmbed({
  sessionId,
  planId,
  returnUrl,
  accent,
}: {
  sessionId: string;
  planId: string | null;
  returnUrl: string;
  accent: string;
}) {
  return (
    <div className="min-h-[640px] overflow-hidden rounded-2xl bg-white ring-1 ring-foreground/10">
      <WhopCheckoutEmbed
        sessionId={sessionId}
        planId={planId ?? undefined}
        returnUrl={returnUrl}
        theme="light"
        themeOptions={{ accentColor: accent, borderRadius: 12 }}
        fallback={
          <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
            Carregando pagamento…
          </div>
        }
      />
    </div>
  );
}
