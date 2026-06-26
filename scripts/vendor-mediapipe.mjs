// MediaPipe tasks-vision WASM + 모델을 앱에 로컬 번들한다(런타임 CDN 의존 제거).
//
// Why: detector 가 CDN(jsdelivr/googleapis)에서 wasm·모델을 받아오면, 자리비움
// 복귀 시 재다운로드가 사내 방화벽/오프라인에서 막혀 감지가 영영 안 살아난다
// (카메라 ON·실루엣/측정 없음·에러도 없음). 로컬 번들이면 재요청 자체가 사라져
// 즉시 복귀하고 오프라인·사내망에서도 동작한다.
//
// 동작: wasm 은 node_modules(오프라인 가용)에서 복사, 모델 4종은 1회 다운로드 후
// public/mediapipe/ 에 캐시. 이미 받은 파일은 건너뛴다(idempotent). public/ 는
// vite 가 dist/ 루트로 복사하므로 dev/prod(tauri) 모두 /mediapipe/... 로 served.
//
// 실행: npm 의 predev/prebuild 훅이 자동 호출. 수동은 `node scripts/vendor-mediapipe.mjs`.

import { createWriteStream } from "node:fs";
import { mkdir, copyFile, stat, readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WASM_SRC = path.join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = path.join(ROOT, "public", "mediapipe", "wasm");
const MODELS_DEST = path.join(ROOT, "public", "mediapipe", "models");

// SIMD(internal) + 비SIMD 폴백(nosimd)만 복사. module 변형(~11MB)은 이 로더 경로에선
// 불필요해 제외 — 디스크 절약. FilesetResolver 가 기기 지원에 맞춰 자동 선택한다.
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

// detector.ts 의 *_MODEL_URL 과 동일 버전·경로. 파일명은 detector 의 로컬 경로와 일치.
const MODELS = [
  {
    name: "pose_landmarker_lite.task",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
  {
    name: "face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  {
    name: "hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
  {
    name: "selfie_multiclass_256x256.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
  },
];

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(path.join(WASM_SRC, WASM_FILES[0])))) {
    throw new Error(
      `tasks-vision wasm not found at ${WASM_SRC} — run \`npm install\` first.`,
    );
  }
  await mkdir(WASM_DEST, { recursive: true });
  for (const f of WASM_FILES) {
    const dest = path.join(WASM_DEST, f);
    if (await exists(dest)) continue;
    await copyFile(path.join(WASM_SRC, f), dest);
    console.log(`  wasm  ✓ ${f}`);
  }
}

async function downloadModel({ name, url }) {
  const dest = path.join(MODELS_DEST, name);
  if (await exists(dest)) {
    console.log(`  model · ${name} (cached)`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed ${res.status} ${name} ← ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const { size } = await stat(dest);
  console.log(`  model ✓ ${name} (${(size / 1e6).toFixed(1)} MB)`);
}

async function main() {
  console.log("vendor-mediapipe: bundling wasm + models into public/mediapipe/");
  await copyWasm();
  await mkdir(MODELS_DEST, { recursive: true });
  for (const m of MODELS) await downloadModel(m);

  const got = await readdir(MODELS_DEST);
  const missing = MODELS.filter((m) => !got.includes(m.name));
  if (missing.length) {
    throw new Error(`missing models after vendor: ${missing.map((m) => m.name).join(", ")}`);
  }
  console.log("vendor-mediapipe: done.");
}

main().catch((e) => {
  console.error("vendor-mediapipe failed:", e.message);
  process.exit(1);
});
