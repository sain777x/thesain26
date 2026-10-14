import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { isHexColor } from "@/lib/format";
import { isReservedSlug, slugify } from "@/lib/slug";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(48),
  description: z.string().trim().max(2000),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  primaryColor: z.string().trim(),
  accentColor: z.string().trim(),
  published: z.boolean(),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.store) {
      throw new HttpError(400, "Sua loja ainda não existe.");
    }
    const body = schema.parse(await request.json());
    if (!isHexColor(body.primaryColor) || !isHexColor(body.accentColor)) {
      throw new HttpError(400, "Use cores no formato #RRGGBB.");
    }
    const slug = slugify(body.slug);
    if (isReservedSlug(slug)) {
      throw new HttpError(400, "Esse endereço de loja está reservado.");
    }
    if (body.logoUrl && !/^https?:\/\//.test(body.logoUrl)) {
      throw new HttpError(400, "A logo precisa ser uma URL http(s).");
    }
    const taken = await prisma.store.findFirst({
      where: { slug, NOT: { id: user.store.id } },
    });
    if (taken) {
      throw new HttpError(409, "Outra loja já usa esse endereço.");
    }

    const store = await prisma.store.update({
      where: { id: user.store.id },
      data: {
        name: body.name,
        slug,
        description: body.description,
        logoUrl: body.logoUrl || null,
        primaryColor: body.primaryColor,
        accentColor: body.accentColor,
        published: body.published,
      },
    });
    return NextResponse.json({ store });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Confira os dados da loja." },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
