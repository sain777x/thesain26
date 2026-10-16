"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatRelease } from "@/lib/format";
import type { AccountStanding, SellerTreasury } from "@/lib/payouts";

export type TreasuryRow = {
  id: string;
  name: string;
  email: string;
  store: string | null;
  account: string | null;
  treasury: SellerTreasury | null;
};

const filters = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendente" },
  { id: "reserve", label: "Reserva 14 ou 30 dias" },
  { id: "withdrawn", label: "Já sacou" },
  { id: "available", label: "Saldo disponível" },
] as const;

type FilterId = (typeof filters)[number]["id"];

function matches(row: TreasuryRow, filter: FilterId) {
  const treasury = row.treasury;
  if (filter === "all") return true;
  if (!treasury || treasury.error) return false;
  if (filter === "pending") return treasury.pendingNextDay > 0;
  if (filter === "reserve") return treasury.reserve14 + treasury.reserve30 + treasury.reserveOpen > 0;
  if (filter === "withdrawn") return treasury.withdrawn > 0 || treasury.withdrawing > 0;
  return treasury.available > 0;
}

function cell(treasury: SellerTreasury | null, pick: (treasury: SellerTreasury) => number) {
  if (!treasury) return "—";
  if (treasury.error) return "—";
  return formatMoney(pick(treasury), treasury.currency);
}

function releaseLines(treasury: SellerTreasury) {
  if (treasury.pendingNextDay <= 0) return [];
  if (treasury.pendingSettlements.length > 1) {
    return treasury.pendingSettlements.map(
      (item) => `${formatMoney(item.amount, treasury.currency)} · ${formatRelease(item.at) ?? item.at}`,
    );
  }
  const when = formatRelease(treasury.pendingReleaseAt);
  return [when ?? "Data ainda não informada"];
}

function pendingCell(treasury: SellerTreasury | null) {
  if (!treasury || treasury.error) return "—";
  const amount = formatMoney(treasury.pendingNextDay, treasury.currency);
  const lines = releaseLines(treasury);
  if (lines.length === 0) return amount;
  return (
    <span>
      <span className="block">{amount}</span>
      {lines.map((line) => (
        <span key={line} className="block text-xs text-muted-foreground">
          {line}
        </span>
      ))}
    </span>
  );
}

export function AccountStandingBadge({
  standing,
  connected = true,
}: {
  standing: AccountStanding | null;
  connected?: boolean;
}) {
  if (!connected) return <span className="text-xs text-muted-foreground">Sem conta</span>;
  if (!standing) return <span className="text-xs text-muted-foreground">Sem leitura</span>;
  const variant =
    standing.tone === "ok" ? "default" : standing.tone === "bad" ? "destructive" : "outline";
  return (
    <div className="space-y-1">
      <Badge variant={variant}>{standing.label}</Badge>
      {standing.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}

export function PlatformBalance({
  title,
  treasury,
}: {
  title: string;
  treasury: SellerTreasury;
}) {
  const lines = releaseLines(treasury);
  const slices = [
    { key: "pending", value: treasury.pendingNextDay, className: "bg-emerald-700" },
    { key: "reserve", value: treasury.reserveTotal, className: "bg-muted-foreground/45" },
    { key: "available", value: treasury.available, className: "bg-primary" },
  ].filter((slice) => slice.value > 0);
  const sliceTotal = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="font-heading text-4xl">{formatMoney(treasury.total, treasury.currency)}</p>
        </div>
        <AccountStandingBadge standing={treasury.standing} connected />
      </div>
      {sliceTotal > 0 ? (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {slices.map((slice) => (
            <div
              key={slice.key}
              className={slice.className}
              style={{ width: `${(slice.value / sliceTotal) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Total label="Disponível" value={formatMoney(treasury.available, treasury.currency)} />
        <Total
          label="Pendente"
          value={formatMoney(treasury.pendingNextDay, treasury.currency)}
          detail={
            lines.length === 0
              ? undefined
              : lines
                  .map((line) => (line === "Data ainda não informada" ? line : `Libera ${line}`))
                  .join(" · ")
          }
        />
        <Total label="Reserva" value={formatMoney(treasury.reserveTotal, treasury.currency)} />
      </div>
      {treasury.error ? <p className="text-sm text-destructive">{treasury.error}</p> : null}
    </div>
  );
}

export function AdminTreasury({ rows }: { rows: TreasuryRow[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const visible = useMemo(() => rows.filter((row) => matches(row, filter)), [rows, filter]);
  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => {
        const treasury = row.treasury;
        if (!treasury || treasury.error) return sum;
        sum.available += treasury.available;
        sum.pending += treasury.pendingNextDay;
        sum.reserve14 += treasury.reserve14;
        sum.reserve30 += treasury.reserve30;
        sum.reserveOpen += treasury.reserveOpen;
        sum.withdrawn += treasury.withdrawn;
        sum.withdrawing += treasury.withdrawing;
        return sum;
      },
      { available: 0, pending: 0, reserve14: 0, reserve30: 0, reserveOpen: 0, withdrawn: 0, withdrawing: 0 },
    );
  }, [rows]);
  const nextReleaseAt = useMemo(() => {
    const dates = rows
      .map((row) => row.treasury?.pendingReleaseAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return dates[0] ?? null;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Total label="Disponível agora" value={formatMoney(totals.available)} />
        <Total
          label="Pendente"
          value={formatMoney(totals.pending)}
          detail={nextReleaseAt ? `Próxima liberação ${formatRelease(nextReleaseAt)}` : undefined}
        />
        <Total
          label="Reservas"
          value={formatMoney(totals.reserve14 + totals.reserve30 + totals.reserveOpen)}
          detail={`14 dias ${formatMoney(totals.reserve14)} · 30 dias ${formatMoney(totals.reserve30)}`}
        />
        <Total
          label="Saques"
          value={formatMoney(totals.withdrawn)}
          detail={`Em andamento ${formatMoney(totals.withdrawing)}`}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              filter === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span className="ml-1 opacity-70">{rows.filter((row) => matches(row, item.id)).length}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conta neste filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Vendedor</th>
                <th className="py-2 font-medium">Disponível</th>
                <th className="py-2 font-medium">Pendente</th>
                <th className="py-2 font-medium">Reserva 14 dias</th>
                <th className="py-2 font-medium">Reserva 30 dias</th>
                <th className="py-2 font-medium">Reserva sem prazo</th>
                <th className="py-2 font-medium">Sacado</th>
                <th className="py-2 font-medium">Saque a caminho</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="py-3">
                    <p>{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.store ?? "Sem loja"}
                      {row.account ? "" : " · sem conta de recebimento"}
                    </p>
                    <div className="mt-1">
                      <AccountStandingBadge
                        standing={row.treasury?.standing ?? null}
                        connected={Boolean(row.account)}
                      />
                    </div>
                    {row.treasury?.error ? (
                      <p className="mt-1 text-xs text-destructive">{row.treasury.error}</p>
                    ) : null}
                  </td>
                  <td className="py-3">{cell(row.treasury, (item) => item.available)}</td>
                  <td className="py-3">{pendingCell(row.treasury)}</td>
                  <td className="py-3">{cell(row.treasury, (item) => item.reserve14)}</td>
                  <td className="py-3">{cell(row.treasury, (item) => item.reserve30)}</td>
                  <td className="py-3">{cell(row.treasury, (item) => item.reserveOpen)}</td>
                  <td className="py-3">{cell(row.treasury, (item) => item.withdrawn)}</td>
                  <td className="py-3">{cell(row.treasury, (item) => item.withdrawing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        A data ao lado do pendente é o dia em que a Whop libera esse saldo. A reserva de 14 dias reúne o que destrava em até 21 dias;
        a de 30 dias, o que passa disso. O que continua preso sem data fica em reserva sem prazo.
      </p>
    </div>
  );
}

function Total({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
