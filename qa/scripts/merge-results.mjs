#!/usr/bin/env node
// QA 결과 머지 — 에이전트(A) 결과 + 러너(B) 결과를 항목별로 합친다.
// 규칙: "더 강하게 검증된 결과가 이긴다" (Untested 는 항상 짐, 실증>코드>부분).
//
//   node qa/scripts/merge-results.mjs <fileA.json> <fileB.json> [...]
//   (인자 없으면 qa/results 의 최신 2개를 자동 선택)
//
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const RESULTS = resolve(ROOT, "qa/results");

let files = process.argv.slice(2).filter((a) => a.endsWith(".json"));
if (files.length < 2) {
  const all = readdirSync(RESULTS).filter((f) => f.endsWith(".json") && !f.startsWith("merged"))
    .map((f) => resolve(RESULTS, f)).sort();
  files = all.slice(-2);
  console.log("ℹ️ 인자 없음 → 최신 2개 자동 선택:", files.map(basename).join(", "));
}
if (files.length < 2) { console.error("머지할 결과 파일이 2개 이상 필요합니다."); process.exit(1); }

// 검증 강도 점수: Untested 는 0, 결정난 것 우선, 그 안에서 증거 태그로 우열.
const tagRank = (ar = "") => {
  const t = (ar.match(/^\[([^\]\/]+)/) || [])[1] || "";
  if (/실증|단위테스트/.test(t)) return 4;
  if (/코드/.test(t)) return 2;
  if (/부분/.test(t)) return 1;
  return 0; // 수동필요·러너범위외·태그없음
};
const score = (e) => (e.status && e.status !== "Untested" ? 10 : 0) + tagRank(e.actualResult);

const best = new Map();   // id -> {entry, file}
const conflicts = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(f, "utf-8"));
  for (const e of arr) {
    const prev = best.get(e.id);
    if (!prev) { best.set(e.id, { entry: e, file: basename(f) }); continue; }
    // 둘 다 결정났는데 상태가 다르면 충돌 기록
    const bothDecided = prev.entry.status !== "Untested" && e.status !== "Untested";
    if (bothDecided && prev.entry.status !== e.status) {
      conflicts.push({ id: e.id, a: `${prev.entry.status}(${prev.file})`, b: `${e.status}(${basename(f)})` });
    }
    if (score(e) > score(prev.entry)) best.set(e.id, { entry: e, file: basename(f) });
  }
}

const merged = [...best.values()].map((v) => v.entry)
  .sort((a, b) => a.id.localeCompare(b.id));

const ts = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const out = resolve(RESULTS, `merged-${ts}.json`);
writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");

const tally = merged.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
console.log(`✅ ${files.length}개 파일 → ${merged.length}개 항목 머지`);
console.log("집계:", tally);
if (conflicts.length) {
  console.log(`⚠️ 상태 충돌 ${conflicts.length}건 (강한 증거가 채택됨, 검토 권장):`);
  conflicts.forEach((c) => console.log(`  ${c.id}: ${c.a} vs ${c.b}`));
}
console.log(`📄 ${out}`);
