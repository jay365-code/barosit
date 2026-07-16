// 강제 업데이트 게이트 (1차 — 클라이언트, fail-open).
//
// app_config.min_supported_version 을 읽어, 실행 중인 앱 버전이 그보다 낮으면
// 앱 사용을 막고 업데이트 화면(UpdateRequiredGate)을 띄운다. "긴급/장애" 같은
// 경보성 문구 없이, 담백하게 "업데이트해야 계속 이용 가능".
//
// fail-open 원칙: 원격 설정을 성공적으로 읽고 "낮다"고 확인했을 때만 차단한다.
//   - 오프라인·Supabase 장애·값 없음·잘못된 값 → 절대 차단하지 않음.
//   - 이유: 자세 감지는 온디바이스라 오프라인에서 도는 게 핵심 가치. fail-closed 면
//     Supabase 한 번 다운에 전 사용자가 잠긴다. 문제 버전은 온라인이 되어 설정을
//     읽는 순간 차단되므로 목적은 그대로 달성된다.
//
// 확장점(이 훅이 단일 관리 지점):
//   - 2차 서버 게이트: 엣지 함수가 X-Client-Version 검사 → 426. 클라는 그 응답을
//     받으면 이 게이트를 켜면 된다. 버전 비교는 lib/semver 를 서버와 공유.
//   - 3차 Realtime: app_config 행을 구독해 evaluate() 를 즉시 재실행.
//   설계 상세는 docs/force-update-gate.md 참조.

import { useEffect, useState } from "react";
import { supabase } from "./auth/supabase";
import { platform } from "./platform";
import { isBelowMinVersion } from "./lib/semver";

const CONFIG_KEY = "min_supported_version";
/** 세션 중 재확인 주기 — 부팅 후 원격 설정이 바뀌어도 언젠가 게이트가 걸리도록.
 *  (3차 Realtime 을 붙이면 이 폴링은 즉시 푸시로 대체/보완된다.) */
const RECHECK_MS = 30 * 60 * 1000; // 30분

export interface UpdateGateState {
  /** true 면 앱 사용을 막고 업데이트 화면을 띄운다. fail-open: 확신할 때만 true. */
  blocked: boolean;
  /** 요구되는 최소 버전 (표시용). */
  requiredVersion: string | null;
}

export function useUpdateGate(): UpdateGateState {
  const [state, setState] = useState<UpdateGateState>({
    blocked: false,
    requiredVersion: null,
  });

  useEffect(() => {
    let alive = true;

    const evaluate = async (): Promise<void> => {
      try {
        const { data, error } = await supabase
          .from("app_config")
          .select("value")
          .eq("key", CONFIG_KEY)
          .maybeSingle();
        // fail-open: 값 없음/에러 → 상태 유지(차단하지 않음). 이미 blocked 였다면
        // 일시적 오류로 풀어주지 않는다(확인된 구버전은 계속 막힘).
        if (error || !data?.value) return;
        const min = String(data.value);
        const current = await platform.getAppVersion();
        if (!alive) return;
        const blocked = isBelowMinVersion(current, min);
        setState({ blocked, requiredVersion: blocked ? min : null });
      } catch {
        /* fail-open: 네트워크/RLS 실패 → 상태 유지 */
      }
    };

    void evaluate();
    const id = window.setInterval(() => void evaluate(), RECHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return state;
}

// ── 관리자 설정 (app_config.min_supported_version 읽기/쓰기) ────────────────
// is_admin() RLS 로 보호됨. 강제 업데이트 게이트를 켜고/끄는 운영 레버.
// 실사용자를 차단하는 프로덕션 동작이므로 호출부에서 확인 다이얼로그 필수.

/** 현재 설정된 최소 지원 버전. 값 없으면 null (게이트 꺼짐). */
export async function getMinSupportedVersion(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (error || !data?.value) return null;
    return String(data.value);
  } catch {
    return null;
  }
}

/**
 * 최소 지원 버전 설정. version 이 null/빈값이면 행을 삭제(게이트 해제).
 * v0.9.10 이상 사용자 중 이 버전 미만은 다음 재평가(≤30분)/재시작 시 차단된다.
 */
export async function setMinSupportedVersion(version: string | null): Promise<void> {
  const v = version?.trim();
  if (!v) {
    const { error } = await supabase
      .from("app_config")
      .delete()
      .eq("key", CONFIG_KEY);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("app_config").upsert(
    { key: CONFIG_KEY, value: v, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw error;
}
