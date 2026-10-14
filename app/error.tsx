"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6">
      <p className="text-sm text-primary">thesain26</p>
      <h1 className="mt-3 text-4xl">Algo saiu do eixo</h1>
      <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
      <Button type="button" className="mt-6 h-10 w-fit px-4" onClick={reset}>
        Tentar de novo
      </Button>
    </main>
  );
}
