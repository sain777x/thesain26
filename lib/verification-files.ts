/** Arquivos da análise do negócio: vários, no formato que a Whop mostra no pedido. */

export const MAX_VERIFICATION_FILES = 30;
export const DOCUMENT_BYTES = 32 * 1024 * 1024;
export const VIDEO_BYTES = 100 * 1024 * 1024;

const DOCUMENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
  "application/pdf",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/avi",
  "video/x-msvideo",
  "video/mpeg",
  "video/ogg",
  "video/x-matroska",
]);

export const VERIFICATION_FILE_ACCEPT = [
  ...DOCUMENT_TYPES,
  ...VIDEO_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
  ".bmp",
  ".tif",
  ".tiff",
  ".pdf",
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".avi",
  ".mkv",
  ".mpeg",
  ".mpg",
  ".ogv",
].join(",");

export function verificationContentType(file: { name: string; type: string }) {
  const type = file.type.toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (type === "video/x-m4v") return "video/mp4";
  if (DOCUMENT_TYPES.has(type) || VIDEO_TYPES.has(type)) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".avi")) return "video/x-msvideo";
  if (name.endsWith(".mkv")) return "video/x-matroska";
  if (name.endsWith(".mpeg") || name.endsWith(".mpg")) return "video/mpeg";
  if (name.endsWith(".ogv")) return "video/ogg";
  return "";
}

export function verificationFileKind(file: { name: string; type: string; size: number }) {
  const type = verificationContentType(file);
  if (!type) {
    return {
      ok: false as const,
      reason: `${file.name} precisa ser imagem (JPEG, PNG e outras), PDF ou vídeo (MP4 e outros).`,
    };
  }
  const kind = type.startsWith("video/") ? ("video" as const) : ("document" as const);
  const limit = kind === "video" ? VIDEO_BYTES : DOCUMENT_BYTES;
  if (file.size <= 0 || file.size > limit) {
    return {
      ok: false as const,
      reason:
        kind === "video"
          ? `${file.name} passa de 100 MB. Envie um vídeo menor.`
          : `${file.name} precisa ter até 32 MB.`,
    };
  }
  return { ok: true as const, kind, type };
}
