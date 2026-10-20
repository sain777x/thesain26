import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { verificationFileKind } from "@/lib/verification-files";
import { uploadPrivateFile } from "@/lib/verification-submit";

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Conecte a conta antes de enviar documentos.");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new HttpError(400, "Escolha uma imagem, um PDF ou um vídeo.");
    }
    const checked = verificationFileKind(file);
    if (!checked.ok) {
      throw new HttpError(400, checked.reason);
    }
    const type = checked.type;

    const name = file.name.replace(/[^\w.\- ]+/g, "").slice(0, 80) || "documento";
    const id = await uploadPrivateFile({
      accountId: user.whopBizId,
      name,
      type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
