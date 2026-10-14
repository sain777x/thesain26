"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ChevronLeft, Landmark, Plus, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { queueToast } from "@/components/toast";
import { countryFlag, listCountries, type CountryOption } from "@/lib/countries";
import { arrivalLabel, formatDate, formatMoney, payoutStatusLabel } from "@/lib/format";
import type { CatalogMethod, PayoutField } from "@/lib/payouts";
import type { PayoutMethodRow, PayoutRow } from "@/lib/whop";

type QuoteView = {
  amount: number;
  currency: string;
  fee: number;
  net: number;
  destinationAmount: number | null;
  destinationCurrency: string | null;
  exchangeRate: number | null;
  expiresAt: string;
};

const countries = listCountries();

function methodTitle(method: PayoutMethodRow) {
  return method.nickname || method.payerName || "Carteira";
}

export function PayoutDesk({
  connected,
  currency,
  available,
  methods,
  history,
}: {
  connected: boolean;
  currency: string;
  available: number;
  methods: PayoutMethodRow[];
  history: PayoutRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"country" | "method" | "details">("country");
  const [countryQuery, setCountryQuery] = useState("");
  const [country, setCountry] = useState<CountryOption | null>(null);
  const [catalog, setCatalog] = useState<CatalogMethod[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [methodQuery, setMethodQuery] = useState("");
  const [picked, setPicked] = useState<CatalogMethod | null>(null);
  const [fields, setFields] = useState<PayoutField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [walletId, setWalletId] = useState(methods.find((item) => item.isDefault)?.id ?? methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [bankWarning, setBankWarning] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (walletId && methods.some((method) => method.id === walletId)) return;
    setWalletId(methods.find((method) => method.isDefault)?.id ?? methods[0]?.id ?? "");
  }, [methods, walletId]);

  const visibleCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (!query) return countries;
    return countries.filter((item) =>
      `${item.name} ${item.localName} ${item.code}`.toLowerCase().includes(query),
    );
  }, [countryQuery]);

  const selectedWallet = methods.find((method) => method.id === walletId) ?? null;

  const visibleMethods = useMemo(() => {
    const query = methodQuery.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter((item) =>
      `${item.name} ${item.destinationCurrency} ${item.deliveryType}`.toLowerCase().includes(query),
    );
  }, [catalog, methodQuery]);

  function resetDialog() {
    setStep("country");
    setCountryQuery("");
    setCountry(null);
    setCatalog([]);
    setCatalogError(null);
    setSetupNote(null);
    setMethodQuery("");
    setPicked(null);
    setFields([]);
    setValues({});
    setFieldsError(null);
  }

  async function chooseCountry(next: CountryOption) {
    setCountry(next);
    setStep("method");
    setCatalog([]);
    setCatalogError(null);
    setSetupNote(null);
    setCatalogLoading(true);
    setMethodQuery("");
    try {
      const response = await fetch(`/api/payouts/catalog?country=${next.code}`);
      const data = (await response.json()) as {
        methods?: CatalogMethod[];
        setupRequired?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível listar os métodos.");
      setCatalog(data.methods ?? []);
      setSetupNote(
        data.setupRequired
          ? "A verificação ainda precisa ser concluída para salvar a carteira. Os métodos deste país já aparecem abaixo."
          : null,
      );
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Não foi possível listar os métodos.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function chooseMethod(method: CatalogMethod) {
    if (!country) return;
    setPicked(method);
    setStep("details");
    setFields([]);
    setValues({});
    setFieldsError(null);
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({
        country: country.code,
        method: method.id,
        destination: method.destinationCurrency,
      });
      const response = await fetch(`/api/payouts/catalog?${params}`);
      const data = (await response.json()) as { fields?: PayoutField[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível abrir o método.");
      setFields(data.fields ?? []);
    } catch (error) {
      setFieldsError(error instanceof Error ? error.message : "Não foi possível abrir o método.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function saveWallet() {
    if (!country || !picked) return;
    setSaving(true);
    setFieldsError(null);
    try {
      const response = await fetch("/api/payouts/methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country.code,
          supportedPayoutMethodId: picked.id,
          destinationCurrency: picked.destinationCurrency,
          nickname: `${picked.name} ${picked.destinationCurrency.toUpperCase()}`,
          fields: values,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar a carteira.");
      setOpen(false);
      resetDialog();
      queueToast("Carteira cadastrada.");
      router.refresh();
    } catch (error) {
      setFieldsError(error instanceof Error ? error.message : "Não foi possível salvar a carteira.");
    } finally {
      setSaving(false);
    }
  }

  async function removeWallet(id: string) {
    setRemoving(id);
    setWithdrawError(null);
    try {
      const response = await fetch("/api/payouts/methods", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível remover a carteira.");
      if (walletId === id) setWalletId("");
      queueToast("Carteira removida.");
      router.refresh();
    } catch (error) {
      setWithdrawError(error instanceof Error ? error.message : "Não foi possível remover a carteira.");
    } finally {
      setRemoving(null);
    }
  }

  async function preview(confirm: boolean, acknowledgeBankWarning = false) {
    setWithdrawError(null);
    if (!confirm) setBankWarning(false);
    const parsed = Number(amount.replace(",", "."));
    if (!walletId || !Number.isFinite(parsed) || parsed <= 0) {
      setWithdrawError("Escolha a carteira e um valor.");
      return;
    }
    if (confirm) setSending(true);
    else setQuoting(true);
    try {
      const response = await fetch("/api/payouts/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutMethodId: walletId,
          amount: parsed,
          confirm,
          acknowledgeBankWarning,
        }),
      });
      const data = (await response.json()) as {
        quote?: QuoteView;
        payout?: { id: string };
        error?: string;
        bankWarning?: boolean;
      };
      if (!response.ok) {
        setBankWarning(Boolean(data.bankWarning));
        throw new Error(data.error ?? "Não foi possível sacar.");
      }
      if (data.quote) setQuote(data.quote);
      if (data.payout) {
        setAmount("");
        setQuote(null);
        setBankWarning(false);
        queueToast("Saque enviado. O status aparece no histórico.");
        router.refresh();
      }
    } catch (error) {
      setWithdrawError(error instanceof Error ? error.message : "Não foi possível sacar.");
    } finally {
      setQuoting(false);
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-neutral-100 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <Landmark className="mt-0.5 size-5 text-neutral-300" />
            <div>
              <h2 className="text-base font-medium">Carteiras de saque</h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-400">
                Para onde o dinheiro vai. Cadastrar a carteira fica nesta página; depois o saque é feito aqui mesmo.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 border-neutral-700 bg-neutral-950 px-4 text-neutral-100 hover:bg-neutral-900"
            disabled={!connected}
            onClick={() => {
              resetDialog();
              setOpen(true);
            }}
          >
            <Plus />
            Adicionar carteira
          </Button>
        </div>
        <div className="mt-4">
          {!connected ? (
            <p className="text-sm text-neutral-400">
              Termine o cadastro da loja para liberar o saque.
            </p>
          ) : methods.length === 0 ? (
            <p className="text-sm text-neutral-400">Nenhuma carteira cadastrada ainda.</p>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {methods.map((method) => (
                <li key={method.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <MethodIcon iconUrl={method.iconUrl} name={methodTitle(method)} />
                    <span>
                      <span className="block">
                        {methodTitle(method)}
                        {method.isDefault ? " · padrão" : ""}
                      </span>
                      <span className="text-neutral-400">
                        {method.currency.toUpperCase()}
                        {method.reference ? ` · ${method.reference}` : ""} · {payoutStatusLabel(method.status)}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-neutral-400 underline-offset-2 hover:text-neutral-100 hover:underline disabled:opacity-50"
                    disabled={removing === method.id}
                    onClick={() => removeWallet(method.id)}
                  >
                    {removing === method.id ? "Removendo…" : "Remover"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-neutral-100 sm:px-5">
        <div className="flex gap-3">
          <ArrowDownToLine className="mt-0.5 size-5 text-neutral-300" />
          <div>
            <h2 className="text-base font-medium">Sacar</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Escolha o valor e a carteira. A taxa e o prazo aparecem antes de confirmar.
            </p>
          </div>
        </div>
        {methods.length === 0 ? (
          <p className="mt-4 rounded-xl border border-neutral-800 px-4 py-3 text-sm text-neutral-400">
            Cadastre uma carteira para poder sacar.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-neutral-300">
              Carteira
              <select
                className="mt-1 h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100"
                value={walletId}
                onChange={(event) => {
                  setWalletId(event.target.value);
                  setQuote(null);
                }}
              >
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {methodTitle(method)} · {method.currency.toUpperCase()}
                    {method.reference ? ` · ${method.reference}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-neutral-300">
              Valor ({currency.toUpperCase()})
              <div className="mt-1 flex gap-2">
                <Input
                  inputMode="decimal"
                  value={amount}
                  placeholder="0,00"
                  className="h-11 border-neutral-700 bg-neutral-950 text-neutral-100"
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setQuote(null);
                    setBankWarning(false);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-neutral-700 bg-neutral-950 px-3 text-neutral-100 hover:bg-neutral-900"
                  disabled={available <= 0}
                  onClick={() => {
                    setAmount(available.toFixed(2));
                    setQuote(null);
                  }}
                >
                  Tudo
                </Button>
              </div>
              <span className="mt-1 block text-xs text-neutral-500">
                Disponível: {formatMoney(available, currency)}
                {selectedWallet?.estimatedArrival
                  ? ` · previsão ${arrivalLabel(selectedWallet.estimatedArrival)}`
                  : ""}
              </span>
            </label>
            {quote ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
                <p>Taxa {formatMoney(quote.fee, quote.currency)}</p>
                <p>Você recebe {formatMoney(quote.net, quote.currency)}</p>
                {quote.destinationAmount != null && quote.destinationCurrency ? (
                  <p>
                    No destino: {formatMoney(quote.destinationAmount, quote.destinationCurrency)}
                    {quote.exchangeRate ? ` · câmbio ${quote.exchangeRate}` : ""}
                  </p>
                ) : null}
                <p className="text-neutral-400">Cotação válida até {formatDate(quote.expiresAt)}</p>
              </div>
            ) : null}
            {withdrawError ? <p className="text-sm text-red-300">{withdrawError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-neutral-700 bg-neutral-950 px-4 text-neutral-100 hover:bg-neutral-900"
                disabled={quoting || sending}
                onClick={() => preview(false)}
              >
                {quoting ? "Calculando…" : "Ver taxa e prazo"}
              </Button>
              <Button
                type="button"
                className="h-10 px-4"
                disabled={sending || quoting || !quote}
                onClick={() => preview(true, bankWarning)}
              >
                {sending ? "Enviando saque…" : bankWarning ? "Confirmar mesmo assim" : "Confirmar saque"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-neutral-100 sm:px-5">
        <div className="flex gap-3">
          <Wallet className="mt-0.5 size-5 text-neutral-300" />
          <div>
            <h2 className="text-base font-medium">Histórico de saques</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Todos os saques desta conta, com as taxas e a situação atual de cada um.
            </p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">
            Nenhum saque ainda. Seu primeiro saque vai aparecer aqui.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-800">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  <span className="block">
                    {formatDate(row.createdAt)}
                    {row.destination ? ` · ${row.destination}` : ""}
                  </span>
                  <span className="text-neutral-400">
                    Taxa {formatMoney(row.fee, row.currency)}
                    {row.arrival ? ` · previsão ${arrivalLabel(row.arrival)}` : ""}
                    {row.failure ? ` · ${row.failure}` : ""}
                  </span>
                </span>
                <span>
                  {formatMoney(row.amount, row.currency)} · {payoutStatusLabel(row.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[min(720px,calc(100vh-2rem))] overflow-hidden border-neutral-800 bg-neutral-950 p-0 text-neutral-100 sm:max-w-lg"
        >
          <DialogHeader className="border-b border-neutral-800 px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-neutral-100">
              <Landmark className="size-4" />
              Adicionar carteira
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Escolha o país, o método e preencha os dados. Nada sai desta página.
            </DialogDescription>
            <button
              type="button"
              className="absolute top-3 right-3 rounded-lg px-2 py-1 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              onClick={() => setOpen(false)}
            >
              Fechar
            </button>
          </DialogHeader>

          {step === "country" ? (
            <div className="px-5 py-4">
              <h3 className="text-center text-lg font-medium">Selecione o país ou região</h3>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
                <input
                  autoFocus
                  value={countryQuery}
                  placeholder="Pesquise por um país ou região"
                  className="h-12 w-full rounded-xl border border-orange-500 bg-neutral-950 pr-3 pl-10 text-neutral-100 outline-none placeholder:text-neutral-500"
                  onChange={(event) => setCountryQuery(event.target.value)}
                />
              </div>
              <ul className="mt-3 max-h-80 overflow-y-auto">
                {visibleCountries.map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-neutral-900"
                      onClick={() => chooseCountry(item)}
                    >
                      <span className="text-xl" aria-hidden>
                        {item.flag}
                      </span>
                      <span>
                        <span className="block text-sm">{item.name}</span>
                        <span className="block text-xs text-neutral-500">{item.code}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === "method" && country ? (
            <div className="px-5 py-4">
              <button
                type="button"
                className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100"
                onClick={() => setStep("country")}
              >
                <ChevronLeft className="size-4" />
                País
              </button>
              <h3 className="text-center text-lg font-medium">
                <span className="mr-2">{countryFlag(country.code)}</span>
                Selecionar método de pagamento
              </h3>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
                <input
                  value={methodQuery}
                  placeholder="Pesquisar métodos de pagamento"
                  className="h-12 w-full rounded-xl border border-orange-500 bg-neutral-950 pr-3 pl-10 text-neutral-100 outline-none placeholder:text-neutral-500"
                  onChange={(event) => setMethodQuery(event.target.value)}
                />
              </div>
              {setupNote ? (
                <p className="pt-3 text-center text-xs text-neutral-400">{setupNote}</p>
              ) : null}
              {catalogLoading ? (
                <p className="py-8 text-center text-sm text-neutral-400">Carregando métodos…</p>
              ) : catalogError ? (
                <p className="py-8 text-center text-sm text-red-300">{catalogError}</p>
              ) : visibleMethods.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-400">
                  Nenhum método disponível para {country.localName}.
                </p>
              ) : (
                <ul className="mt-3 max-h-80 overflow-y-auto">
                  {visibleMethods.map((method) => (
                    <li key={`${method.id}-${method.destinationCurrency}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-neutral-900"
                        onClick={() => chooseMethod(method)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <MethodIcon iconUrl={method.iconUrl} name={method.name} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{method.name}</span>
                            <span className="block text-xs text-neutral-500">
                              {method.destinationCurrency.toUpperCase()}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-neutral-400">
                          {method.fee != null ? <span className="block">Prev. {formatMoney(method.fee, currency)}</span> : null}
                          <span className="block">Prev. {arrivalLabel(method.arrival)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {step === "details" && picked && country ? (
            <div className="max-h-[28rem] overflow-y-auto px-5 py-4">
              <button
                type="button"
                className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100"
                onClick={() => setStep("method")}
              >
                <ChevronLeft className="size-4" />
                Métodos
              </button>
              <h3 className="text-lg font-medium">{picked.name}</h3>
              <p className="mt-1 text-sm text-neutral-400">
                {country.localName} · {picked.destinationCurrency.toUpperCase()}
                {picked.fee != null ? ` · taxa prevista ${formatMoney(picked.fee, currency)}` : ""}
              </p>
              {catalogLoading ? (
                <p className="py-8 text-sm text-neutral-400">Carregando campos…</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {fields.map((field) => (
                    <label key={field.id} className="block text-sm text-neutral-300">
                      {field.label}
                      {field.required ? "" : " (opcional)"}
                      {field.options && field.options.length > 0 ? (
                        <select
                          className="mt-1 h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100"
                          value={values[field.id] ?? ""}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.id]: event.target.value }))
                          }
                        >
                          <option value="">Selecione</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.inputType === "date" ? "date" : "text"}
                          autoComplete="off"
                          placeholder={field.placeholder ?? ""}
                          value={values[field.id] ?? ""}
                          className="mt-1 h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none placeholder:text-neutral-600"
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.id]: event.target.value }))
                          }
                        />
                      )}
                    </label>
                  ))}
                  {fields.length === 0 && !fieldsError ? (
                    <p className="text-sm text-neutral-400">
                      Esse método não pediu campos extras. Você pode salvar a carteira.
                    </p>
                  ) : null}
                  {fieldsError ? <p className="text-sm text-red-300">{fieldsError}</p> : null}
                  <Button type="button" className="h-10 px-4" disabled={saving || catalogLoading || Boolean(fieldsError)} onClick={saveWallet}>
                    {saving ? "Salvando…" : "Salvar carteira"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MethodIcon({ iconUrl, name }: { iconUrl: string | null; name: string }) {
  if (iconUrl) {
    return (
      // Whop hosts the rail icon. It is an image, not a navigation.
      <img src={iconUrl} alt="" className="size-8 rounded-full bg-neutral-800 object-contain" />
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-neutral-800 text-xs">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
