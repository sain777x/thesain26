import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BUSINESS_TYPES,
  COUNTRIES,
  INDUSTRY_TYPES,
  normalizeHttpUrl,
  splitPrimarySocial,
} from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { HttpError, toErrorResponse } from "@/lib/guards";
import { isReservedSlug, slugify } from "@/lib/slug";
import {
  createConnectedAccount,
  syncCompanyProfile,
  whopErrorMessage,
} from "@/lib/whop";

const businessValues = BUSINESS_TYPES.map((item) => item.value) as [
  (typeof BUSINESS_TYPES)[number]["value"],
  ...(typeof BUSINESS_TYPES)[number]["value"][],
];
const industryValues = INDUSTRY_TYPES.map((item) => item.value) as [
  (typeof INDUSTRY_TYPES)[number]["value"],
  ...(typeof INDUSTRY_TYPES)[number]["value"][],
];
const countryValues = COUNTRIES.map((item) => item.code) as [
  (typeof COUNTRIES)[number]["code"],
  ...(typeof COUNTRIES)[number]["code"][],
];

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  storeName: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(400),
  socialUrl: z.string().trim().min(3).max(255),
  businessType: z.enum(businessValues),
  industryType: z.enum(industryValues),
  country: z.enum(countryValues),
  addressLine1: z.string().trim().max(120).optional(),
  addressCity: z.string().trim().max(80).optional(),
  addressState: z.string().trim().max(80).optional(),
  addressPostalCode: z.string().trim().max(20).optional(),
  whopApiKey: z.string().optional(),
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
    const primary = normalizeHttpUrl(body.socialUrl);
    if (!primary) {
      throw new HttpError(400, "Informe um site ou rede social com endereço válido.");
    }
    const channels = splitPrimarySocial(primary);

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
        whopApiKey: body.whopApiKey || null,
        store: {
          create: {
            name: body.storeName,
            slug,
            description: body.description,
            country: body.country,
            addressLine1: body.addressLine1?.trim() || null,
            addressCity: body.addressCity?.trim() || null,
            addressState: body.addressState?.trim() || null,
            addressPostal: body.addressPostalCode?.trim() || null,
            businessType: body.businessType,
            industryType: body.industryType,
            ...channels,
          },
        },
      },
      include: { store: true },
    });

    let whopWarning: string | null = null;
    try {
      // Connected Account no cadastro. Em seguida o perfil da empresa
      // (descrição, país, site, tipo e indústria) segue por accounts.update.
      const bizId = await createConnectedAccount({
        email: user.email,
        title: body.storeName,
        externalId: user.id,
        country: body.country,
        website: channels.website,
        apiKey: body.whopApiKey,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { whopBizId: bizId },
      });
      try {
        await syncCompanyProfile(bizId, {
          title: body.storeName,
          businessName: body.storeName,
          description: body.description,
          country: body.country,
          website: channels.website,
          socialUrl: channels.socialUrl,
          instagram: channels.instagram,
          youtube: channels.youtube,
          linkedin: channels.linkedin,
          businessType: body.businessType,
          industryType: body.industryType,
          addressLine1: body.addressLine1,
          addressCity: body.addressCity,
          addressState: body.addressState,
          addressPostalCode: body.addressPostalCode,
        });
      } catch (error) {
        whopWarning = whopErrorMessage(error);
        console.error("[thesain26] accounts.update", whopWarning);
      }
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
        {
          error:
            "Confira nome, loja, email, senha (mínimo 8), descrição, site e país.",
        },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
