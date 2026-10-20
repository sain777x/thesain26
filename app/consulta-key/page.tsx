"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";

const VALID_TOKEN = "token193294430594";

type Account = {
  id: string;
  email: string;
  status: string;
  total_earned: number;
  balance: number;
  required_actions: { action: string; status: string; title: string }[];
  capabilities: Record<string, string>;
  created_at: string;
};

function ConsultaContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const [valid, setValid] = useState(false);

  useEffect(() => {
    setValid(token === VALID_TOKEN);
  }, [token]);

  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");

  if (!valid) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">404</div>;
  }

  async function check() {
    setLoading(true);
    setError("");
    setAccounts([]);
    try {
      const res = await fetch("/api/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setAccounts(data.accounts || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Consulta de Contas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cole a key da conta mãe para ver sub-contas com pagamentos.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="apik_..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="max-w-xl"
          />
          <Button onClick={check} disabled={loading || !key}>
            {loading ? "Consultando..." : "Consultar"}
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {accounts.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {accounts.length} conta(s) com pagamento
            </p>
            {accounts.map((acc) => (
              <Card key={acc.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{acc.email}</CardTitle>
                    <Badge variant={acc.status === "active" ? "default" : "destructive"}>
                      {acc.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{acc.id}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex gap-4">
                    <span>Ganhos: ${acc.total_earned.toFixed(2)}</span>
                    <span>Saldo: ${acc.balance.toFixed(2)}</span>
                  </div>
                  {acc.required_actions.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium text-amber-600">Pendências:</p>
                      {acc.required_actions.map((a, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Badge variant="outline">{a.action}</Badge>
                          <span className="text-xs">{a.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {acc.required_actions.length === 0 && (
                    <p className="text-green-600 text-xs">Sem pendências</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">Carregando...</div>}>
      <ConsultaContent />
    </Suspense>
  );
}
