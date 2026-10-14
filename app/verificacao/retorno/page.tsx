export const dynamic = "force-dynamic";

export default function VerificacaoRetornoPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm text-muted-foreground">thesain26</p>
      <h1 className="text-4xl">Informações recebidas</h1>
      <p className="text-sm text-muted-foreground">
        A análise continua por aqui. Volte para Verificações para ver se o pedido saiu da lista.
      </p>
      <a
        href="/painel/verificacoes"
        target="_top"
        className="inline-flex h-10 w-fit items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground"
      >
        Voltar às verificações
      </a>
    </main>
  );
}
