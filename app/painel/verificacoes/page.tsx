import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerificationForm } from "@/components/verification-form";
import { ReloadAction } from "@/components/reload-action";
import { appUrl } from "@/lib/app-url";
import { kycReviewLabel } from "@/lib/format";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  listVerificationTasks,
  openVerificationSession,
  syncKycStatus,
  whopErrorMessage,
} from "@/lib/whop";
import {
  capabilityLabel,
  categoryLabel,
  taskStatusLabel,
  type VerificationTask,
} from "@/lib/verification-tasks";
import { cn } from "cn";

export const dynamic = "force-dynamic";

function TaskResolve({
  task,
  sessionUrl,
}: {
  task: VerificationTask;
  sessionUrl: string | null;
}) {
  if (task.resolve.kind === "form") {
    return (
      <VerificationForm
        verificationId={task.resolve.verificationId}
        fields={task.resolve.fields}
        label={task.resolve.label}
      />
    );
  }
  if (task.resolve.kind === "session") {
    if (!sessionUrl) {
      return (
        <p className="text-sm text-muted-foreground">
          Não foi possível abrir o formulário agora. Atualize a página e tente de novo.
        </p>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Preencha aqui mesmo. Não precisa entrar na Whop nem sair da thesain26.
        </p>
        <iframe
          title={task.title}
          src={sessionUrl}
          allow="camera; microphone; fullscreen"
          className="h-[760px] w-full rounded-xl border bg-white"
        />
        <a href={`/painel/verificacoes?tarefa=${encodeURIComponent(task.id)}`} className="text-sm underline">
          Já enviei, atualizar status
        </a>
      </div>
    );
  }
  if (task.resolve.kind === "url") {
    const external = task.resolve.url.startsWith("http");
    return (
      <div className="space-y-3">
        {task.resolve.embed ? (
          <iframe
            title={task.title}
            src={task.resolve.url}
            allow="camera; microphone"
            className="h-[640px] w-full rounded-xl border bg-white"
          />
        ) : (
          <a
            href={task.resolve.url}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground"
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {task.resolve.label}
          </a>
        )}
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">{task.resolve.label}</p>;
}

export default async function VerificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tarefa?: string }>;
}) {
  const query = await searchParams;
  let user = await requireSeller();
  let error: string | null = null;
  let tasks: VerificationTask[] = [];

  const returnUrl = `${appUrl()}/verificacao/retorno`;
  const refreshUrl = `${appUrl()}/painel/verificacoes?onboarding=refresh`;

  const bizId = user.whopBizId;
  if (bizId) {
    try {
      const snapshot = await syncKycStatus(bizId);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          kycStatus: snapshot.status,
          kycDetail: snapshot.detail,
          kycCheckedAt: new Date(),
        },
        include: { store: true },
      });
      tasks = await listVerificationTasks(bizId, user.kycStatus);
    } catch (caught) {
      error = whopErrorMessage(caught);
    }
  }

  const openTasks = tasks.filter((task) => task.status !== "done");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const selected =
    tasks.find((task) => task.id === query.tarefa) ?? null;
  const label = kycReviewLabel(user.kycStatus);
  let sessionUrl: string | null = null;
  if (selected?.resolve.kind === "session" && user.whopBizId) {
    try {
      sessionUrl = await openVerificationSession({
        accountId: user.whopBizId,
        kind: selected.resolve.kindHint,
        returnUrl,
        refreshUrl,
      });
    } catch (caught) {
      error = error ?? whopErrorMessage(caught);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Conta Whop</p>
          <h1 className="text-4xl">Verificações</h1>
        </div>
        <Badge variant={user.kycStatus === "verified" ? "default" : "outline"}>{label}</Badge>
      </div>

      {error ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!user.whopBizId ? (
        <Card>
          <CardHeader>
            <CardTitle>Conta Whop ainda não conectada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              KYC, prova de vendas e pedidos extras aparecem aqui assim que a
              connected account existir. Você escolhe qual resolver primeiro.
            </p>
            <ReloadAction href="/api/whop/connect">Conectar agora</ReloadAction>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {openTasks.length === 0
                ? "Nenhuma tarefa pendente."
                : `${openTasks.length} ${openTasks.length === 1 ? "tarefa pendente" : "tarefas pendentes"}. Escolha qual resolver primeiro.`}
            </p>
            <ul className="space-y-2">
              {tasks.map((task) => {
                const active = selected?.id === task.id;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/painel/verificacoes?tarefa=${encodeURIComponent(task.id)}`}
                      className={cn(
                        "block rounded-xl px-3 py-3 ring-1 ring-foreground/10",
                        active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                        task.status === "done" && !active && "opacity-70",
                      )}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block text-xs opacity-80">{categoryLabel(task.category)}</span>
                          <span className="mt-1 block text-sm font-medium">{task.title}</span>
                        </span>
                        <span className="shrink-0 text-xs">{taskStatusLabel(task.status)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Provas de vendas e documentos extras entram nesta lista quando a Whop solicitar.
              </p>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{selected ? selected.title : "Detalhe da tarefa"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{categoryLabel(selected.category)}</Badge>
                    <Badge variant={selected.status === "done" ? "secondary" : "outline"}>
                      {taskStatusLabel(selected.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                  {selected.details.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {selected.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                  {selected.blocked.length > 0 ? (
                    <p className="text-sm">
                      Enquanto isso estiver aberto, fica bloqueado:{" "}
                      {selected.blocked.map(capabilityLabel).join(", ")}.
                    </p>
                  ) : null}
                  <TaskResolve task={selected} sessionUrl={sessionUrl} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selecione uma tarefa ao lado. KYC, prova de vendas e pedidos
                  adicionais abrem separados, na ordem que você quiser.
                  {doneTasks.length > 0
                    ? ` ${doneTasks.length} já ${doneTasks.length === 1 ? "foi concluída" : "foram concluídas"}.`
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
