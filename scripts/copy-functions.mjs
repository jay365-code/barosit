// 커뮤니티 SEO(#18): repo 루트 functions/ 를 빌드 산출물 dist-web/functions/ 로 복사.
// 이 프로젝트는 사전빌드된 dist-web/ 를 커밋→Cloudflare Pages 자동배포(output dir=dist-web)라,
// Pages 가 output dir 내부 functions/ 를 찾도록 여기서 복사한다. 소스는 리뷰 가능한 루트에 유지.
import { existsSync, cpSync, rmSync } from "node:fs";

const SRC = "functions";
const DEST = "dist-web/functions";

if (!existsSync(SRC)) {
  console.log("[copy-functions] no functions/ dir — skip");
  process.exit(0);
}

rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });
console.log(`[copy-functions] ${SRC} → ${DEST}`);
