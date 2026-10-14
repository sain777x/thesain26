"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { queueToast } from "@/components/toast";

export function RefundSaleButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refund() {
    if (!window.confirm("Reembolsar este pagamento para o comprador?")) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/${saleId}/refund`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível reembolsar.");
      queueToast("Reembolso enviado.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível reembolsar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" className="h-9" disabled={pending} onClick={refund}>
        {pending ? "Reembolsando…" : "Reembolsar"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function PrintReceiptButton() {
  return (
    <Button type="button" variant="outline" className="h-9" onClick={() => window.print()}>
      Recibo
    </Button>
  );
}
