"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AccountLinkButton({
  useCase,
  children,
  variant = "default",
}: {
  useCase: "account_onboarding" | "payouts_portal";
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/whop/account-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCase }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!response.ok || !data.url) {
      setError(data.error ?? "Não foi possível abrir o fluxo da Whop.");
      setPending(false);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        className="h-10 px-4"
        disabled={pending}
        onClick={open}
      >
        {pending ? "Abrindo a Whop…" : children}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
