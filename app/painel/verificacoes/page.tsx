import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessRfi } from "@/components/business-rfi";
import { VerificationForm } from "@/components/verification-form";
import { ReloadAction } from "@/components/reload-action";
import { appUrl } from "@/lib/app-url";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  loadVerificationDesk,
  openVerificationSession,
  syncKycStatus,
  whopErrorMessage,
} from "@/lib/whop";
import {
  isDescriptionRequest,
  isSocialRequest,
  isUploadField,
  taskStatusLabel,
  type IdentityLane,
  type InformationField,
  type VerificationDesk,
  type VerificationTask,
} from "@/lib/verification-tasks";
import { cn } from "cn";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  switch (status) {
    case "approved":
      return "Aprovada";
    case "pending":
    case "processing":
      return "Em andamento";
    case "manual_review":
      return "Em análise";
    case "action_required":
      return "Pendente";
    case "rejected":
      return "Recusada";
    default:
      return "Não iniciada";
  }
}

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
      <iframe
        title={task.title}
        src={sessionUrl}
        allow="camera; microphone; fullscreen"
        className="h-[760px] w-full rounded-xl border bg-white"
      />
    );
  }
  if (task.resolve.kind === "url") {
    if (task.resolve.embed) {
      return (
        <iframe
          title={task.title}
          src={task.resolve.url}
          allow="camera; microphone; fullscreen"
          className="h-[760px] w-full rounded-xl border bg-white"
        />
      );
    }
    const external = task.resolve.url.startsWith("http");
    return (
      <a
        href={task.resolve.url}
        className={cn(buttonVariants(), "h-10 px-4")}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {task.resolve.label}
      </a>
    );
  }
  return <p className="text-sm text-muted-foreground">{task.resolve.label}</p>;
}

function sectionHref(section: string) {
  return `/painel/verificacoes?secao=${encodeURIComponent(section)}`;
}

export default async function VerificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string }>;
}) {
  const query = await searchParams;
  const user = await requireSeller();
  let error: string | null = null;
  let desk: VerificationDesk | null = null;

  const returnUrl = `${appUrl()}/verificacao/retorno`;
  const refreshUrl = `${appUrl()}/painel/verificacoes?onboarding=refresh`;
  const bizId = user.whopBizId;

  if (bizId) {
    try {
      const snapshot = await syncKycStatus(bizId);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          kycStatus: snapshot.status,
          kycDetail: snapshot.detail,
          kycCheckedAt: new Date(),
        },
      });
      desk = await loadVerificationDesk(bizId);
    } catch (caught) {
      error = whopErrorMessage(caught);
    }
  }

  const section = query.secao ?? "";
  const lane = desk?.identity.find((item) => item.kind === section) ?? null;
  const extra = desk?.extras.find((item) => item.id === section) ?? null;
  const showBusiness = section === "negocio" && Boolean(desk?.businessReview.open);
  let sessionUrl: string | null = null;
  const sessionKind = lane && lane.status !== "approved" ? lane.kind : extra?.resolve.kind === "session" ? extra.resolve.kindHint : null;

  if (sessionKind && bizId) {
    try {
      sessionUrl = await openVerificationSession({
        accountId: bizId,
        kind: sessionKind,
        returnUrl,
        refreshUrl,
      });
    } catch (caught) {
      error = error ?? whopErrorMessage(caught);
    }
  }

  const businessTasks = desk?.businessReview.tasks ?? [];
  const formTasks = businessTasks.filter((task) => task.resolve.kind === "form");
  const businessSessions = new Map<string, string>();
  if (showBusiness && desk && bizId && !desk.businessReview.pendingReview) {
    for (const task of businessTasks) {
      if (task.resolve.kind !== "session" || task.status === "pending") continue;
      try {
        businessSessions.set(
          task.id,
          await openVerificationSession({
            accountId: bizId,
            kind: task.resolve.kindHint ?? "business",
            returnUrl,
            refreshUrl,
          }),
        );
      } catch (caught) {
        error = error ?? whopErrorMessage(caught);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Conta Whop</p>
        <h1 className="text-4xl">Verificações</h1>
      </div>

      {error ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {!bizId ? (
        <Card>
          <CardHeader>
            <CardTitle>Conta Whop ainda não conectada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>A análise do negócio e as verificações aparecem aqui assim que a conta existir.</p>
            <ReloadAction href="/api/whop/connect">Conectar agora</ReloadAction>
          </CardContent>
        </Card>
      ) : !desk ? (
        <p className="text-sm text-muted-foreground">Não foi possível ler as verificações desta conta.</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg">Ações necessárias</h2>
            <div className="space-y-3">
              {desk.businessReview.open ? (
                <Link
                  href={sectionHref("negocio")}
                  className={cn(
                    "block rounded-xl px-4 py-4 ring-1 ring-foreground/10",
                    showBusiness ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block font-medium">{desk.businessReview.title}</span>
                      {desk.businessReview.affectsWithdrawals ? (
                        <span className="mt-1 block text-sm opacity-80">Afeta saques</span>
                      ) : null}
                    </span>
                    <span className="text-xs">
                      {desk.businessReview.pendingReview ? "Em análise" : "Pendente"}
                    </span>
                  </span>
                </Link>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Verificação de identidade e da empresa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Esta parte é o KYC. Escolha individual ou empresarial para abrir o fluxo de identidade. A análise do negócio é o outro card.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {desk.identity.map((item) => (
                      <IdentityChoice key={item.kind} lane={item} active={section === item.kind} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {section === "negocio" && !desk.businessReview.open ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma pergunta aberta chegou da Whop nesta leitura. Atualize a página antes de enviar qualquer coisa.
            </p>
          ) : null}

          {showBusiness ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg">{desk.businessReview.title}</h2>
                  <p className="text-sm text-muted-foreground">{desk.businessReview.description}</p>
                </div>
                <Link
                  href="/painel/verificacoes?secao=negocio&refresh=1"
                  className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}
                >
                  Atualizar
                </Link>
              </div>
              {desk.businessReview.pendingReview ? (
                <p className="text-sm">
                  A Whop está analisando o que você enviou. Os saques ficam pausados até a análise; as vendas continuam.
                </p>
              ) : null}
              {[
                ...businessTasks.filter((task) => task.id === "business-review-rfi"),
                ...formTasks,
                ...businessTasks.filter(
                  (task) => task.resolve.kind !== "form" && task.id !== "business-review-rfi",
                ),
              ].map((task) => (
                <Card key={task.id}>
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <CardTitle>{task.title}</CardTitle>
                      <Badge variant="outline">{taskStatusLabel(task.status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                    {task.details.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {task.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    ) : null}
                    {task.id === "business-review-rfi" && bizId ? (
                      <BusinessRfi accountId={bizId} />
                    ) : task.resolve.kind === "form" ? (
                      <VerificationForm
                        verificationId={task.resolve.verificationId}
                        fields={[...task.resolve.fields].sort(
                          (left, right) => answerOrder(left) - answerOrder(right),
                        )}
                        label={task.resolve.label}
                      />
                    ) : (
                      <TaskResolve task={task} sessionUrl={businessSessions.get(task.id) ?? null} />
                    )}
                  </CardContent>
                </Card>
              ))}
              <p className="text-sm text-muted-foreground">
                Você pode resolver as pendências na ordem que preferir. A análise do negócio é a que libera os saques primeiro.
              </p>
            </section>
          ) : null}

          {lane ? (
            <Card>
              <CardHeader>
                <CardTitle>{lane.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Badge variant={lane.status === "approved" ? "default" : "outline"}>{statusLabel(lane.status)}</Badge>
                {lane.status === "approved" ? (
                  <p className="text-sm text-muted-foreground">Esta verificação já foi aprovada.</p>
                ) : sessionUrl ? (
                  <iframe
                    title={lane.title}
                    src={sessionUrl}
                    allow="camera; microphone; fullscreen"
                    className="h-[760px] w-full rounded-xl border bg-white"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Não foi possível abrir esta verificação agora. Atualize a página e tente de novo.
                  </p>
                )}
                {lane.forms.map((task) =>
                  task.resolve.kind === "form" ? (
                    <VerificationForm
                      key={task.id}
                      verificationId={task.resolve.verificationId}
                      fields={task.resolve.fields}
                      label={task.resolve.label}
                    />
                  ) : null,
                )}
              </CardContent>
            </Card>
          ) : null}

          {extra ? (
            <Card>
              <CardHeader>
                <CardTitle>{extra.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{extra.description}</p>
                <TaskResolve task={extra} sessionUrl={sessionUrl} />
              </CardContent>
            </Card>
          ) : null}

          {desk.extras.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-lg">Outras pendências</h2>
              <ul className="space-y-2">
                {desk.extras.map((task) => (
                  <li key={task.id}>
                    <Link href={sectionHref(task.id)} className="block rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                      <span className="block text-sm font-medium">{task.title}</span>
                      <span className="text-xs text-muted-foreground">{taskStatusLabel(task.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-lg">Recursos</h2>
            <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
              {desk.capabilities.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>{row.label}</span>
                  <span className="text-right text-muted-foreground">{row.hint}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function IdentityChoice({ lane, active }: { lane: IdentityLane; active: boolean }) {
  return (
    <Link
      href={sectionHref(lane.kind)}
      className={cn(
        "rounded-xl px-4 py-3 ring-1 ring-foreground/10",
        active ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted",
      )}
    >
      <span className="block text-sm font-medium">{lane.title}</span>
      <span className="mt-1 block text-xs opacity-80">{statusLabel(lane.status)}</span>
    </Link>
  );
}

function answerOrder(field: InformationField) {
  if (isDescriptionRequest(field)) return 0;
  if (isSocialRequest(field)) return 1;
  if (isUploadField(field) || field.requirement === "proof_of_fulfillment") return 3;
  return 2;
}

