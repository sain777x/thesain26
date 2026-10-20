import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { MAX_VERIFICATION_FILES } from "@/lib/verification-files";
import { presenceFromAnswers, saveBusinessPresence } from "@/lib/whop";
import {
  assignVerificationAnswers,
  loadOpenInformation,
  submitVerificationAnswers,
} from "@/lib/verification-submit";
import { PROOF_FIELD_ID } from "@/lib/verification-tasks";

const fileId = z.string().regex(/^file_[A-Za-z0-9]+$/);
const schema = z.object({
  verificationId: z.string().regex(/^idpf_[A-Za-z0-9]+$/).optional(),
  description: z.string().trim().max(1000).optional(),
  socialUrl: z.string().trim().max(255).optional(),
  taxHandling: z.enum(["self", "whop", "none"]).optional(),
  taxOptOut: z
    .object({
      responsible: z.literal(true),
      liability: z.literal(true),
      noCollection: z.literal(true),
    })
    .optional(),
  answers: z
    .array(
      z.object({
        id: z.string().regex(new RegExp(`^(inrqi_[A-Za-z0-9]+|${PROOF_FIELD_ID})$`)),
        value: z.string().max(4000).optional(),
        values: z.array(z.string().max(200)).max(20).optional(),
        files: z.array(fileId).max(MAX_VERIFICATION_FILES).optional(),
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
    if (!body.description && !body.socialUrl && !body.taxHandling && answers.length === 0) {
      throw new HttpError(400, "Preencha a descrição, o perfil, o imposto ou os pedidos da análise.");
    }
    if (body.description && body.description.length < 100) {
      throw new HttpError(400, "A descrição precisa ter entre 100 e 1000 caracteres.");
    }
    if (body.taxHandling === "none" && !body.taxOptOut) {
      throw new HttpError(400, "Confirme as três declarações para cuidar do imposto por conta própria.");
    }

    const before = await loadOpenInformation(user.whopBizId);
    const copied = presenceFromAnswers(before, answers);
    const description = body.description || copied.description;
    const socialUrl = body.socialUrl || copied.socialUrl;

    // Se o usuário enviou descrição/social e existem itens abertos correspondentes,
    // monta as answers automaticamente.
    let finalAnswers = [...answers];
    if (description || socialUrl) {
      for (const item of before) {
        if (item.requirement === "business_description" && description && !finalAnswers.some((a) => a.id === item.id)) {
          finalAnswers.push({ id: item.id, value: description });
        }
        if ((item.requirement === "social_media_or_website" || item.requirement === "website") && socialUrl && !finalAnswers.some((a) => a.id === item.id)) {
          finalAnswers.push({ id: item.id, value: socialUrl });
        }
      }
    }

    const assigned = assignVerificationAnswers(finalAnswers, before);

    if (assigned.groups.length === 0) {
      const hasPresence = Boolean(description || socialUrl || body.taxHandling);
      if (hasPresence && answers.length === 0) {
        // Nenhum RFI formal, mas temos dados de presença para salvar
        try {
          await saveBusinessPresence(user.whopBizId, {
            description,
            socialUrl,
            taxRemittedBy: body.taxHandling,
          }, user.whopApiKey);
        } catch (error) {
          console.error("[thesain26] saveBusinessPresence (no RFI)", error);
          throw new HttpError(400, "Não foi possível salvar as informações do negócio.");
        }
        return NextResponse.json({ ok: true, answered: true, presenceOnly: true });
      }

      const pending = before
        .filter((item) => item.id !== PROOF_FIELD_ID)
        .map((item) => item.label)
        .filter(Boolean);
      throw new HttpError(
        400,
        pending.length
          ? `A Whop ainda está pedindo: ${pending.join(" · ")}. Atualize a página e responda só esses campos.`
          : "Não há pergunta aberta na Whop para enviar.",
      );
    }

    for (const group of assigned.groups) {
      await submitVerificationAnswers({
        accountId: user.whopBizId,
        verificationId: group.verificationId,
        answers: group.answers,
      });
    }

    try {
      await saveBusinessPresence(user.whopBizId, {
        description,
        socialUrl,
        taxRemittedBy: body.taxHandling,
      }, user.whopApiKey);
    } catch (error) {
      console.error("[thesain26] saveBusinessPresence", error);
    }

    const answeredIds = new Set(
      assigned.groups.flatMap((group) => group.answers.map((answer) => answer.id)),
    );
    const after = await loadOpenInformation(user.whopBizId);
    const stillOpen = after.filter((item) => item.id !== PROOF_FIELD_ID && !answeredIds.has(item.id));
    if (stillOpen.length > 0) {
      throw new HttpError(
        409,
        `A Whop ainda está pedindo: ${stillOpen.map((item) => item.label).join(" · ")}. Envie só esses campos.`,
      );
    }
    return NextResponse.json({ ok: true, answered: true });
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
