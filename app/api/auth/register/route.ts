import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, toErrorResponse } from "@/lib/guards";
import { isReservedSlug, slugify } from "@/lib/slug";
import { createConnectedAccount, whopErrorMessage } from "@/lib/whop";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  storeName: z.string().trim().min(2).max(80),
});

async function uniqueSlug(base: string) {
  let slug = slugify(base);
  if (isReservedSlug(slug)) slug = `${slug}-loja`;
  let candidate = slug;
  let n = 2;
  while (await prisma.store.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${n}`;
    n += 1;
  }
  return candidate;
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      throw new HttpError(409, "Já existe uma conta com esse email.");
    }

    const ownerEmail = (
      process.env.PLATFORM_OWNER_EMAIL || "dono@thesain26.com"
    ).toLowerCase();
    const role = body.email === ownerEmail ? "owner" : "seller";
    const passwordHash = await bcrypt.hash(body.password, 12);
    const slug = await uniqueSlug(body.storeName);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role,
        store: {
          create: {
            name: body.storeName,
            slug,
            description: "",
          },
        },
      },
      include: { store: true },
    });

    let whopWarning: string | null = null;
    try {
      // Connected Account criada no ato do cadastro e amarrada ao usuário.
      const bizId = await createConnectedAccount({
        email: user.email,
        title: body.storeName,
        externalId: user.id,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { whopBizId: bizId },
      });
    } catch (error) {
      whopWarning = whopErrorMessage(error);
      console.error("[thesain26] accounts.create", whopWarning);
    }

    return NextResponse.json({
      ok: true,
      userId: user.id,
      slug,
      whopWarning,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Confira nome, email, senha (mínimo 8) e nome da loja." },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
