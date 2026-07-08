import { supabase } from "../auth/supabase";

// 커뮤니티 게시글 이미지 업로드 헬퍼.
//
// 업로드 전에 브라우저 캔버스로 리사이즈/재인코딩한다:
//   - 긴 변 기준 최대 1600px 로 축소(원본이 더 작으면 그대로)
//   - JPEG(품질 0.85)로 재인코딩 → EXIF/메타데이터 제거 부수효과 + 용량 절감
// anon 업로드를 허용하는 버킷이라, 클라이언트 압축이 남용/용량의 1차 방어선이다.

const BUCKET = "post-images";
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
// 재인코딩 실패(예: 애니메이션 GIF) 시 원본 허용 상한
const MAX_RAW_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

// 캔버스로 리사이즈+JPEG 재인코딩한 Blob 을 만든다. 실패 시 null → 호출부에서 원본 fallback.
async function compress(file: File): Promise<Blob | null> {
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG 는 투명도 미지원 → 흰 배경 깔고 그린다.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
  } catch {
    return null;
  }
}

export interface UploadResult {
  url: string;
  path: string;
}

// 이미지 파일을 압축·업로드하고 공개 URL 을 반환. 유효성/용량 위반 시 throw.
export async function uploadPostImage(file: File): Promise<UploadResult> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("unsupported image type");
  }

  const compressed = await compress(file);
  // 압축 성공 시 항상 .jpg, 실패 시 원본(단, 상한 초과면 거부)
  let body: Blob;
  let ext: string;
  if (compressed && compressed.size > 0) {
    body = compressed;
    ext = "jpg";
  } else {
    if (file.size > MAX_RAW_BYTES) throw new Error("image too large");
    body = file;
    ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  }

  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `posts/${rand}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: body.type || "image/jpeg",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
