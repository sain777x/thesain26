import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOwner, toErrorResponse } from "@/lib/guards";

const schema = z.object({
  feePercent: z.number().min(0.5).max(80),
});

export async function PATCH(request: Request) {
  try {
    await requireOwner();
    const { feePercent } = schema.parse(await request.json());
    const settings = await prisma.platformSettings.upsert({
      where: { id: "platform" },
      update: { feePercent },
      create: { id: "platform", feePercent, name: "thesain26" },
    });
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "A comissão fica entre 0,5% e 80%." },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
