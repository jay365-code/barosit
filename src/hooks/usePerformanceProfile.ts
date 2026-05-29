import { useEffect, useState } from "react";
import {
  getLoopParams,
  loadPerformanceProfile,
  subscribePerformanceProfile,
  type LoopParams,
  type PerformanceProfile,
} from "../performanceConfig";

/**
 * 현재 성능 프로필에 따른 감지 루프 파라미터를 반환하고, 설정 변경 시 라이브로
 * 갱신한다. usePoseLoop 를 쓰는 모든 호출부(MonitorView, useMonitoringEngine)가
 * 같은 소스를 공유하도록 하는 단일 진입점.
 */
export function usePerformanceProfile(visible: boolean): LoopParams {
  const [profile, setProfile] = useState<PerformanceProfile>(() =>
    loadPerformanceProfile(),
  );
  useEffect(() => subscribePerformanceProfile(setProfile), []);
  return getLoopParams(profile, visible);
}
