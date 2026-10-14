import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintReceiptButton, RefundSaleButton } from "@/components/sale-actions";
import { formatDate, formatMoney, saleStatusLabel } from "@/lib/format";
import type { SaleDetail } from "@/lib/sale-detail";

const billingLabels: Record<string, string> = {
  one_time: "Pagamento único",
  subscription_create: "Início da assinatura",
  subscription_cycle: "Renovação",
  subscription_update: "Atualização da assinatura",
  subscription: "Assinatura",
  manual: "Cobrança manual",
};

const holdLabels: Record<string, string> = {
  reserve: "Reserva",
  bnpl: "Parcelamento",
  sequra: "Sequra",
  fraud_hold: "Retenção por risco",
  preshipment_hold: "Aguardando envio",
};

const ruleLabels: Record<string, string> = {
  allow: "Permitir",
  block: "Bloquear",
  review: "Revisar",
  enforce_3ds: "Exigir 3DS",
};

const checkLabels: Record<string, string> = {
  pass: "Aprovado",
  fail: "Falhou",
  unavailable: "Indisponível",
  unchecked: "Não verificado",
  not_provided: "Não informado",
  not_supported: "Não suportado",
  mismatch: "Não confere",
  match: "Confere",
  null: "Não informado",
};

function checkText(value: string | null | undefined) {
  if (!value) return "Não informado";
  return checkLabels[value] ?? value;
}

function countryName(code: string | null | undefined) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function addressLines(address: SaleDetail["billing"]) {
  if (!address) return [];
  const country = countryName(address.country);
  return [
    address.name,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    country,
  ].filter((line): line is string => Boolean(line));
}

function riskBand(score: number) {
  if (score <= 30) return "Baixo";
  if (score <= 60) return "Médio";
  return "Alto";
}

function initials(name: string | null, email: string | null) {
  const source = name || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function cardTitle(detail: SaleDetail) {
  if (!detail.card) return detail.methodType || "Pagamento";
  const brand = detail.card.brand
    ? detail.card.brand.charAt(0).toUpperCase() + detail.card.brand.slice(1)
    : detail.card.displayName;
  if (detail.card.last4) return `${brand} — ${detail.card.last4}`;
  return brand || detail.card.displayName || "Cartão";
}

function expiry(detail: SaleDetail) {
  const month = detail.card?.expMonth;
  const year = detail.card?.expYear;
  if (!month || !year) return null;
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function SaleDetailView({
  detail,
  backHref,
}: {
  detail: SaleDetail;
  backHref: string;
}) {
  const billing = addressLines(detail.billing);
  const mapSrc = detail.map
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${detail.map.lon - 0.08}%2C${detail.map.lat - 0.05}%2C${detail.map.lon + 0.08}%2C${detail.map.lat + 0.05}&layer=mapnik&marker=${detail.map.lat}%2C${detail.map.lon}`
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar às vendas
          </Link>
          <h1 className="mt-2 text-3xl sm:text-4xl">{detail.title}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{detail.paymentId}</p>
          {detail.sellerName ? (
            <p className="text-sm text-muted-foreground">Vendedor: {detail.sellerName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{saleStatusLabel(detail.status)}</Badge>
          {detail.substatus && detail.substatus !== detail.status ? (
            <Badge variant="outline">{detail.substatus.replaceAll("_", " ")}</Badge>
          ) : null}
          {detail.refundable ? <RefundSaleButton saleId={detail.id} /> : null}
        </div>
      </div>

      {detail.whopError ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Parte do detalhe não veio da Whop: {detail.whopError}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total cobrado" value={formatMoney(detail.total, detail.currency)} />
        <Metric label="Taxa da plataforma" value={`-${formatMoney(detail.platformFee, detail.currency)}`} />
        <Metric
          label="Taxa de processamento"
          value={detail.processingFee == null ? "—" : `-${formatMoney(detail.processingFee, detail.currency)}`}
        />
        <Metric
          label="Sua parte"
          value={detail.sellerShare == null ? "—" : formatMoney(detail.sellerShare, detail.currency)}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{cardTitle(detail)}</p>
                <p className="text-muted-foreground">
                  {expiry(detail) ? `Válido ${expiry(detail)}` : detail.methodType || "Método não informado"}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{saleStatusLabel(detail.status)}</Badge>
                <Badge variant="outline">{detail.threeDs ? "3DS" : "Sem 3DS"}</Badge>
              </div>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              <Fact label="Motivo da cobrança" value={billingLabels[detail.billingReason ?? ""] ?? detail.billingReason ?? "—"} />
              <Fact label="Criado" value={formatDate(detail.createdAt)} />
              <Fact label="Pago em" value={detail.paidAt ? formatDate(detail.paidAt) : "Ainda não pago"} />
              <Fact label="Liberação do saldo" value={detail.settlementAt ? formatDate(detail.settlementAt) : "Ainda sem data"} />
              <Fact
                label="Reembolso"
                value={
                  detail.refundedAt
                    ? `Reembolsado em ${formatDate(detail.refundedAt)}`
                    : detail.refundable
                      ? "Reembolsável agora"
                      : "Não reembolsável"
                }
              />
              <Fact
                label="Já reembolsado"
                value={detail.refundedAmount ? formatMoney(detail.refundedAmount, detail.currency) : "—"}
              />
            </dl>
            {detail.failure ? <p className="text-destructive">{detail.failure}</p> : null}
            {detail.decline ? <p className="text-muted-foreground">Recusa: {detail.decline}</p> : null}
            <div className="border-t pt-3">
              <Row label="Subtotal" value={detail.subtotal == null ? "—" : formatMoney(detail.subtotal, detail.currency)} />
              <Row label="Imposto" value={detail.tax == null ? "—" : formatMoney(detail.tax, detail.currency)} />
              <Row label="Total" value={formatMoney(detail.total, detail.currency)} />
              <Row
                label="Líquido após taxas"
                value={detail.amountAfterFees == null ? "—" : formatMoney(detail.amountAfterFees, detail.currency)}
              />
            </div>
            <div className="print:hidden">
              <PrintReceiptButton />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comprador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted font-medium">
                  {initials(detail.buyer.name, detail.buyer.email)}
                </span>
                <div>
                  <p className="font-medium">{detail.buyer.name || "Comprador"}</p>
                  <p className="text-muted-foreground">{detail.buyer.email || "E-mail não informado"}</p>
                  {detail.buyer.username ? (
                    <p className="text-muted-foreground">@{detail.buyer.username}</p>
                  ) : null}
                </div>
              </div>
              {detail.buyer.phone ? <p>Telefone {detail.buyer.phone}</p> : null}
              <div>
                <p className="text-muted-foreground">Endereço de cobrança</p>
                {billing.length === 0 ? (
                  <p>Não informado neste pagamento.</p>
                ) : (
                  billing.map((line) => <p key={line}>{line}</p>)
                )}
              </div>
              {detail.buyer.email ? (
                <a className="underline" href={`mailto:${detail.buyer.email}`}>
                  Escrever ao comprador
                </a>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Localização do comprador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {mapSrc ? (
                <iframe
                  title="Mapa do endereço de cobrança"
                  src={mapSrc}
                  className="h-48 w-full rounded-xl border"
                />
              ) : (
                <p className="text-muted-foreground">
                  Sem endereço suficiente para posicionar o mapa.
                </p>
              )}
              <p>{detail.map?.label || billing.join(", ") || "Endereço não informado."}</p>
              {detail.map ? (
                <a
                  className="underline"
                  href={`https://www.openstreetmap.org/?mlat=${detail.map.lat}&mlon=${detail.map.lon}#map=12/${detail.map.lat}/${detail.map.lon}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir mapa
                </a>
              ) : null}
              <p className="text-xs text-muted-foreground">
                O mapa usa o endereço de cobrança. IP e navegador não vêm neste pagamento.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verificações e risco</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p>Pontuação de risco</p>
              <p className="font-medium">
                {detail.riskScore == null ? "Sem pontuação" : `${detail.riskScore}/100 · ${riskBand(detail.riskScore)}`}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, detail.riskScore ?? 0))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Índice publicado pela Whop, de 0 a 100. Não é uma probabilidade de fraude.
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Fact label="Endereço (AVS)" value={checkText(detail.checks?.address)} />
            <Fact label="CEP" value={checkText(detail.checks?.zip)} />
            <Fact label="Titular" value={checkText(detail.checks?.name)} />
            <Fact label="CVV" value={checkText(detail.checks?.cvv)} />
            <Fact label="Autorização" value={detail.checks?.authorization || "—"} />
            <Fact label="Referência da rede" value={detail.checks?.arn || "—"} />
            <Fact label="Regras de risco acionadas" value={String(detail.rules.length)} />
            <Fact label="Retenções ativas" value={String(detail.holds.length)} />
          </dl>
          {detail.rules.length > 0 ? (
            <ul className="space-y-1">
              {detail.rules.map((rule) => (
                <li key={rule.id}>
                  {rule.name || "Regra"} · {ruleLabels[rule.action] ?? rule.action}
                </li>
              ))}
            </ul>
          ) : null}
          {detail.holds.length > 0 ? (
            <ul className="space-y-1">
              {detail.holds.map((hold) => (
                <li key={`${hold.type}-${hold.releaseAt}`}>
                  {holdLabels[hold.type] ?? hold.type} · {formatMoney(hold.amount, hold.currency)}
                  {hold.percentage != null ? ` · ${hold.percentage}%` : ""}
                  {hold.releaseAt ? ` · libera ${formatDate(hold.releaseAt)}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {detail.autoRefunded ? <p>A Whop reembolsou este pagamento automaticamente.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item neste pagamento.</p>
            ) : (
              <ul className="divide-y text-sm">
                {detail.items.map((item) => (
                  <li key={`${item.label}-${item.sku}`} className="flex items-start justify-between gap-3 py-3">
                    <span>
                      <span className="block font-medium">{item.label}</span>
                      <span className="text-muted-foreground">
                        Qtd {item.quantity}
                        {item.sku ? ` · ${item.sku}` : ""}
                      </span>
                    </span>
                    <span>{item.amount == null ? "—" : formatMoney(item.amount, item.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {detail.timeline.map((event) => (
                <li key={`${event.at}-${event.label}`} className="flex gap-3">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <span>
                    <span className="block font-medium">{event.label}</span>
                    <span className="text-muted-foreground">{formatDate(event.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="block font-medium">{formatMoney(detail.total, detail.currency)}</span>
              <span className="font-mono text-xs text-muted-foreground">{detail.paymentId}</span>
            </span>
            <span>
              {saleStatusLabel(detail.status)} · {formatDate(detail.paidAt || detail.createdAt)}
            </span>
          </div>
          {detail.refunds.map((refund) => (
            <div key={refund.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span>
                <span className="block">Reembolso {formatMoney(refund.amount, refund.currency)}</span>
                <span className="font-mono text-xs text-muted-foreground">{refund.id}</span>
              </span>
              <span>
                {refund.status}
                {refund.reason ? ` · ${refund.reason}` : ""} · {formatDate(refund.createdAt)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
