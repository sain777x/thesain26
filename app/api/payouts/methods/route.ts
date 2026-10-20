import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import {
  getPayoutFields,
  isPayoutCurrency,
  removePayoutMethod,
  savePayoutMethod,
  validatePayoutFields,
} from "@/lib/payouts";
import { listPayoutMethods } from "@/lib/whop";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "A conta de recebimento ainda não está pronta.");
    }
    const body = (await request.json().catch(() => null)) as {
      country?: string;
      supportedPayoutMethodId?: string;
      destinationCurrency?: string;
      nickname?: string;
      fields?: Record<string, string>;
      makeDefault?: boolean;
    } | null;
    const country = (body?.country ?? "").toUpperCase();
    const supportedPayoutMethodId = body?.supportedPayoutMethodId ?? "";
    const destinationCurrency = (body?.destinationCurrency ?? "").toLowerCase();
    if (!/^[A-Z]{2}$/.test(country) || !supportedPayoutMethodId.startsWith("podst_")) {
      throw new HttpError(400, "Escolha o país e o método de pagamento.");
    }
    if (!isPayoutCurrency(destinationCurrency)) {
      throw new HttpError(400, "Moeda de destino inválida.");
    }
    const schema = await getPayoutFields({
      accountId: user.whopBizId,
      country,
      supportedPayoutMethodId,
      destinationCurrency,
    });
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(body?.fields ?? {})) {
      if (typeof value === "string") values[key] = value;
    }
    const fields = validatePayoutFields(schema, values);
    const existing = await listPayoutMethods(user.whopBizId, user.whopApiKey);
    const id = await savePayoutMethod({
      accountId: user.whopBizId,
      supportedPayoutMethodId,
      destinationCurrency,
      nickname: (body?.nickname || "Carteira").trim() || "Carteira",
      fields,
      isDefault: body?.makeDefault === true || existing.length === 0,
    });
    return NextResponse.json({ id });
  } catch (error) {
    if (
      error instanceof Error &&
      !(error instanceof HttpError) &&
      (error.message.startsWith("Preencha") || error.message.includes("saque desta conta"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      (error.message.includes("formato") || error.message.includes("limite"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "A conta de recebimento ainda não está pronta.");
    }
    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id ?? "";
    if (!id.startsWith("potk_")) {
      throw new HttpError(400, "Carteira inválida.");
    }
    const owned = await listPayoutMethods(user.whopBizId, user.whopApiKey);
    if (!owned.some((method) => method.id === id)) {
      throw new HttpError(404, "Essa carteira não está nesta conta.");
    }
    await removePayoutMethod(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
