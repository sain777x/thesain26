import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { runAiResolver } from "@/lib/ai-resolver";

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) throw new HttpError(400, "Conecte a conta Whop antes de resolver as pendências.");
    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; checkoutLink?: string; proofFileIds?: string[] };
    const lines: string[] = [];
    lines.push(`[inicio] resolve para ${user.email} (biz=${user.whopBizId}) dryRun=${Boolean(body.dryRun)}`);
    const result = await runAiResolver(user.whopBizId, { dryRun: body.dryRun, checkoutLink: body.checkoutLink, proofFileIds: body.proofFileIds }, lines);
    // cópia local efêmera (Render), mas o debug completo vai no body da resposta
    try {
      const fs = await import("node:fs");
      fs.appendFileSync("/tmp/resolver-debug.txt", result.debug + "\n===== fim =====\n");
    } catch {}
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
