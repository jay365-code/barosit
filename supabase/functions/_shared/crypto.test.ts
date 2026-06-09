// billing_key 암호화 단위테스트 (deno test --allow-env).
// 키를 import 전에 주입해야 모듈 상단 상수가 이를 읽는다.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// 32바이트 키(ASCII 32자) → base64
Deno.env.set("ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef"));

const { encryptSecret, decryptSecret } = await import("./crypto.ts");

Deno.test("암호화→복호화 왕복 일치 + 포맷", async () => {
  const secret = "billing_key_abc123_XYZ";
  const enc = await encryptSecret(secret);
  assert(enc !== null);
  assert(enc!.startsWith("enc:v1:"), "암호문 prefix");
  assert(enc !== secret, "평문과 달라야 한다");
  assertEquals(await decryptSecret(enc), secret);
});

Deno.test("긴 빌링키도 왕복 일치", async () => {
  const long = "bk_" + "x".repeat(300);
  assertEquals(await decryptSecret(await encryptSecret(long)), long);
});

Deno.test("null 입력은 null 반환", async () => {
  assertEquals(await encryptSecret(null), null);
  assertEquals(await decryptSecret(null), null);
  assertEquals(await encryptSecret(undefined), null);
});

Deno.test("평문(미암호화) 값 읽기는 그대로 통과(레거시/키없음 호환)", async () => {
  assertEquals(await decryptSecret("plain_legacy_value"), "plain_legacy_value");
});
