import { NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/guards";
import { refundOwnedSale } from "@/lib/sale-detail";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await refundOwnedSale(id, user);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
