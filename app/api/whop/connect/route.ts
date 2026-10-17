import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  createConnectedAccount,
  syncCompanyProfile,
  whopErrorMessage,
} from "@/lib/whop";

/** Tenta de novo a Connected Account se o cadastro não conseguiu criá-la. */
export async function POST() {
  try {
    const user = await requireSeller();
    if (!user.store) {
      throw new HttpError(400, "Crie a loja antes de conectar a conta Whop.");
    }

    let bizId = user.whopBizId;
    if (!bizId) {
      bizId = await createConnectedAccount({
        email: user.email,
        title: user.store.name,
        externalId: user.id,
        country: user.store.country,
        website: user.store.website,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { whopBizId: bizId },
      });
    }

    let whopWarning: string | null = null;
    try {
      await syncCompanyProfile(bizId, {
        title: user.store.name,
        businessName: user.store.name,
        description: user.store.description,
        country: user.store.country,
        website: user.store.website,
        socialUrl: user.store.socialUrl,
        instagram: user.store.instagram,
        youtube: user.store.youtube,
        linkedin: user.store.linkedin,
        businessType: user.store.businessType,
        industryType: user.store.industryType,
        addressLine1: user.store.addressLine1,
        addressCity: user.store.addressCity,
        addressState: user.store.addressState,
        addressPostalCode: user.store.addressPostal,
      });
    } catch (error) {
      whopWarning = whopErrorMessage(error);
      console.error("[thesain26] accounts.update", whopWarning);
    }

    return NextResponse.json({ bizId, whopWarning });
  } catch (error) {
    return toErrorResponse(error);
  }
}
