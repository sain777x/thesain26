import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BUSINESS_TYPES,
  COUNTRIES,
  INDUSTRY_TYPES,
  normalizeHttpUrl,
} from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { isHexColor } from "@/lib/format";
import { isReservedSlug, slugify } from "@/lib/slug";
import { syncCompanyProfile, whopErrorMessage } from "@/lib/whop";

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
  slug: z.string().trim().min(2).max(48),
  description: z.string().trim().max(400),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  primaryColor: z.string().trim(),
  accentColor: z.string().trim(),
  published: z.boolean(),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  socialUrl: z.string().trim().max(255).optional().or(z.literal("")),
  instagram: z.string().trim().max(255).optional().or(z.literal("")),
  youtube: z.string().trim().max(255).optional().or(z.literal("")),
  linkedin: z.string().trim().max(255).optional().or(z.literal("")),
  businessType: z.enum(businessValues),
  industryType: z.enum(industryValues),
  country: z.enum(countryValues),
});

function optionalUrl(value: string | undefined, label: string) {
  if (!value) return null;
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    throw new HttpError(400, `${label} precisa ser um endereço http(s) válido.`);
  }
  return normalized;
}

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

    const website = optionalUrl(body.website, "O site");
    const socialUrl = optionalUrl(body.socialUrl, "A rede principal");
    const instagram = optionalUrl(body.instagram, "O Instagram");
    const youtube = optionalUrl(body.youtube, "O YouTube");
    const linkedin = optionalUrl(body.linkedin, "O LinkedIn");

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
        website,
        socialUrl,
        instagram,
        youtube,
        linkedin,
        businessType: body.businessType,
        industryType: body.industryType,
        country: body.country,
      },
    });

    let whopWarning: string | null = null;
    if (user.whopBizId) {
      try {
        // A loja local já está salva. O update na Whop é a sincronização do perfil.
        await syncCompanyProfile(user.whopBizId, {
          title: store.name,
          businessName: store.name,
          description: store.description,
          country: store.country,
          website: store.website,
          socialUrl: store.socialUrl,
          instagram: store.instagram,
          youtube: store.youtube,
          linkedin: store.linkedin,
          businessType: store.businessType,
          industryType: store.industryType,
        });
      } catch (error) {
        whopWarning = whopErrorMessage(error);
        console.error("[thesain26] accounts.update", whopWarning);
      }
    }

    return NextResponse.json({ store, whopWarning });
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
