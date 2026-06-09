// billing_key / customer_key 저장 시 평문 노출 방지용 대칭 암호화(AES-GCM).
//
// ENCRYPTION_KEY(base64 인코딩된 32바이트 키) 시크릿이 설정돼 있으면 암호화 저장,
// 미설정 시 평문 패스스루(배포 시크릿 누락이 정기청구 전체를 막지 않도록 폴백).
// 저장 포맷: "enc:v1:<base64url-iv>:<base64-ciphertext>" — 그 외 값은 평문으로 간주(레거시 호환).
//
// 키 생성 예: openssl rand -base64 32 → supabase secrets set ENCRYPTION_KEY=<값>

const KEY_B64 = Deno.env.get("ENCRYPTION_KEY");
const PREFIX = "enc:v1:";

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null | undefined;
async function getKey(): Promise<CryptoKey | null> {
  if (cachedKey !== undefined) return cachedKey;
  if (!KEY_B64) { cachedKey = null; return null; }
  try {
    const raw = b64decode(KEY_B64);
    if (raw.length !== 32) {
      console.error("[crypto] ENCRYPTION_KEY 는 base64(32바이트) 여야 합니다 — 평문 폴백");
      cachedKey = null;
      return null;
    }
    cachedKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    return cachedKey;
  } catch (e) {
    console.error("[crypto] 키 임포트 실패 — 평문 폴백:", e);
    cachedKey = null;
    return null;
  }
}

export async function encryptSecret(plain: string | null | undefined): Promise<string | null> {
  if (plain == null) return null;
  const key = await getKey();
  if (!key) return plain; // 키 없음 → 평문 저장(폴백)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  return `${PREFIX}${b64encode(iv)}:${b64encode(ct)}`;
}

export async function decryptSecret(stored: string | null | undefined): Promise<string | null> {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // 평문(레거시/키없음 저장분)
  const key = await getKey();
  if (!key) {
    console.error("[crypto] 암호문이지만 ENCRYPTION_KEY 가 없습니다 — 복호화 불가");
    return null;
  }
  try {
    const rest = stored.slice(PREFIX.length); // "<iv>:<ct>"
    const sep = rest.indexOf(":");
    const iv = b64decode(rest.slice(0, sep));
    const ct = b64decode(rest.slice(sep + 1));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    console.error("[crypto] 복호화 실패:", e);
    return null;
  }
}
