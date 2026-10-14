import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { uploadPrivateFile } from "@/lib/verification-submit";

const ALLOWED = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 12 * 1024 * 1024;

function contentType(file: File) {
  if (file.type === "image/jpg") return "image/jpeg";
  if (ALLOWED.has(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

export async function POST(request: Request) {
  try {
    const user = await requireSeller();
    if (!user.whopBizId) {
      throw new HttpError(400, "Conecte a conta antes de enviar documentos.");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new HttpError(400, "Escolha um arquivo JPEG, PNG ou PDF.");
    }
    const type = contentType(file);
    if (!type) {
      throw new HttpError(400, "Envie JPEG, PNG ou PDF.");
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new HttpError(400, "O arquivo precisa ter até 12 MB.");
    }

    const name = file.name.replace(/[^\w.\- ]+/g, "").slice(0, 80) || "documento";
    const id = await uploadPrivateFile({
      name,
      type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
