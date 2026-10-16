import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { getWhop, presenceFromAnswers, saveBusinessPresence } from "@/lib/whop";
import { submitVerificationAnswers } from "@/lib/verification-submit";

const fileId = z.string().regex(/^file_[A-Za-z0-9]+$/);
const schema = z.object({
  verificationId: z.string().regex(/^idpf_[A-Za-z0-9]+$/).optional(),
  description: z.string().trim().max(1000).optional(),
  socialUrl: z.string().trim().max(255).optional(),
  answers: z
    .array(
      z.object({
        id: z.string().regex(/^inrqi_[A-Za-z0-9]+$/),
        value: z.string().max(4000).optional(),
        values: z.array(z.string().max(200)).max(20).optional(),
        files: z.array(fileId).max(20).optional(),
        address: z
          .object({
            line1: z.string().max(200),
            line2: z.string().max(200).optional(),
            city: z.string().max(100),
            state: z.string().max(100),
            postal_code: z.string().max(20),
            country: z.string().length(2),
          })
          .optional(),
        documents: z.record(z.string(), fileId).optional(),
      }),
    )
    .max(30)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Conecte a conta antes de enviar as informações.");
    }
    const body = schema.parse(await request.json());
    const answers = body.answers ?? [];
    if (!body.description && !body.socialUrl && answers.length === 0) {
      throw new HttpError(400, "Preencha a descrição, o perfil ou os pedidos da análise.");
    }

    let description = body.description;
    let socialUrl = body.socialUrl;
    if (body.verificationId && answers.length > 0) {
      const list = await getWhop().verifications.list({ account_id: user.whopBizId });
      const verification = (list.data ?? []).find((item) => item.id === body.verificationId);
      const copied = presenceFromAnswers(
        (verification?.requested_information ?? []).map((item) => ({
          id: item.id,
          requirement: item.requirement,
          label: item.label,
          type: item.type,
          responseType: item.response_type,
        })),
        answers,
      );
      description = description || copied.description;
      socialUrl = socialUrl || copied.socialUrl;
    }

    await saveBusinessPresence(user.whopBizId, { description, socialUrl });
    if (body.verificationId && answers.length > 0) {
      await submitVerificationAnswers({
        accountId: user.whopBizId,
        verificationId: body.verificationId,
        answers,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Revise os campos e envie de novo." }, { status: 400 });
    }
    if (error instanceof Error && !(error instanceof HttpError)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
