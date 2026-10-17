"use client";

import { useCallback, useState } from "react";
import { RfiElement, Verifications, WhopElements } from "@whop/elements-react";
import { loadWhop } from "@whop/elements";

/**
 * Pedidos extras da Whop, abertos nesta página.
 * O token é da conta conectada do vendedor logado. Não há login no painel da Whop.
 */
export function BusinessRfi({ accountId }: { accountId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const getToken = useCallback(async () => {
    const response = await fetch("/api/whop/verification-token", { cache: "no-store" });
    const data = (await response.json()) as { token?: string; error?: string };
    if (!response.ok || !data.token) {
      throw new Error(data.error ?? "Não foi possível abrir as pendências.");
    }
    return data.token;
  }, []);

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {sent ? (
        <p className="text-sm">
          Enviado. A Whop está analisando. Clique em Atualizar para reler o status. Os saques seguem pausados até a análise; as vendas continuam.
        </p>
      ) : null}
      <div className="min-h-40 overflow-hidden rounded-xl bg-white p-2 ring-1 ring-foreground/10">
        <WhopElements elements={loadWhop()}>
          <Verifications accountId={accountId} getToken={getToken} locale="pt">
            <RfiElement
              onSubmitted={() => setSent(true)}
              onLoadFailed={() =>
                setError("Não foi possível ler as pendências agora. Atualize a página e tente de novo.")
              }
              onError={() =>
                setError("O formulário da Whop não abriu. Atualize a página e tente de novo.")
              }
            />
          </Verifications>
        </WhopElements>
      </div>
    </div>
  );
}
