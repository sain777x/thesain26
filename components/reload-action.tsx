"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReloadAction({
  href,
  children,
  variant = "outline",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const response = await fetch(href, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Não foi possível concluir.");
      setPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        className="h-10 px-4"
        disabled={pending}
        onClick={run}
      >
        {pending ? "Aguarde…" : children}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
