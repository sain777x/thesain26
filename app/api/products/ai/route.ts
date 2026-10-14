import { NextResponse } from "next/server";
import { requireSeller, toErrorResponse } from "@/lib/guards";
import { generateProductDraft } from "@/lib/product-ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSeller();
    const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const product = await generateProductDraft(prompt);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof Error && !("statusCode" in error)) {
      const status = /chave da IA|Inclua o preço|Descreva o produto|passou de/.test(error.message)
        ? 400
        : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return toErrorResponse(error);
  }
}
