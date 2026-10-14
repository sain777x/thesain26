import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { getAccountBalance } from "@/lib/whop";

export async function GET() {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Connected account ainda não configurada.");
    }
    const balance = await getAccountBalance(user.whopBizId);
    return NextResponse.json(balance);
  } catch (error) {
    return toErrorResponse(error);
  }
}
