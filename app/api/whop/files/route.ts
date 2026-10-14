import { NextResponse } from "next/server";
import { HttpError, requireSeller, toErrorResponse } from "@/lib/guards";
import { uploadPrivateFile } from "@/lib/verification-submit";

const DOCUMENT_BYTES = 32 * 1024 * 1024;
const VIDEO_BYTES = 100 * 1024 * 1024;
const DOCUMENTS = new Set(["image/jpeg", "image/png", "application/pdf"]);
const VIDEOS = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);

function contentType(file: File) {
  const type = file.type.toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (type === "video/x-m4v") return "video/mp4";
  if (DOCUMENTS.has(type) || VIDEOS.has(type)) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".webm")) return "video/webm";
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
      throw new HttpError(400, "Escolha uma imagem, um PDF ou um vídeo.");
    }
    const type = contentType(file);
    if (!type) {
      throw new HttpError(400, "Envie JPEG, PNG, PDF ou um vídeo MP4, MOV ou WEBM.");
    }
    const limit = type.startsWith("video/") ? VIDEO_BYTES : DOCUMENT_BYTES;
    if (file.size <= 0 || file.size > limit) {
      throw new HttpError(
        400,
        type.startsWith("video/")
          ? "O vídeo precisa ter até 100 MB."
          : "O arquivo precisa ter até 32 MB.",
      );
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
