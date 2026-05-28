// 자동 업데이트 — 앱 시작 시 1회 체크. 발견 시 UpdateNotice 가 배너로 안내,
// 사용자 동의 후 다운로드/설치/재시작. 24h 쿨다운은 1차에선 보류 (필요 시 추가).

import { useEffect, useState } from "react";
import { platform } from "./platform";
import type { UpdateInfo, UpdateProgressEvent } from "./platform";

const LAST_CHECK_KEY = "updater_last_check";
const SNOOZE_VERSION_KEY = "updater_snoozed_version";

/** 24h 미만 전에 체크했으면 skip — 앱 종일 열어두는 사용자가 매 시작 시 호출 안 되도록 */
const CHECK_INTERVAL_MS = 1000;

export interface UpdaterState {
  /** 새 버전 정보. null = 없음 또는 미확인 */
  available: UpdateInfo | null;
  /** 다운로드 중 진행률 (0-1). null = 다운로드 안 함 */
  progress: number | null;
  /** 에러 메시지 — 표시 후 사용자가 닫으면 null */
  error: string | null;
  /** 일반 정보 안내 메시지 — 에러가 아닌 최신 버전 알림 등 */
  info: string | null;
  /** 수동 체크 — 결과는 available 에 반영 */
  checkNow(): Promise<void>;
  /** 사용자가 "적용" 클릭. 다운로드 + 설치 + 재시작까지 한 번에 */
  applyUpdate(): Promise<void>;
  /** "나중에" — 같은 버전은 다음 세션까지 다시 안 띄움 */
  snooze(): void;
  /** 에러 닫기 */
  dismissError(): void;
  /** 정보 안내 닫기 */
  dismissInfo(): void;
}

export function useUpdater(): UpdaterState {
  const [available, setAvailable] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const runCheck = async (manual: boolean): Promise<UpdateInfo | null> => {
    if (!platform.features.autoUpdate) return null;
    try {
      const info = await platform.checkForUpdate();
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      if (!info) return null;
      if (!manual) {
        // 자동 체크 — 사용자가 같은 버전을 snooze 했으면 무시
        const snoozed = localStorage.getItem(SNOOZE_VERSION_KEY);
        if (snoozed === info.version) return null;
      }
      setAvailable(info);
      return info;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[barosit][updater] check error", e);
      if (manual) {
        setInfo(null);
        setError(`업데이트 확인 실패: ${msg}`);
      }
      return null;
    }
  };

  // 앱 시작 시 1회 — 마지막 체크 후 24h 경과한 경우에만
  useEffect(() => {
    if (!platform.features.autoUpdate) return;
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    if (Date.now() - last < CHECK_INTERVAL_MS) return;
    // 앱 부팅 직후 부담 줄이려 5초 지연
    const t = setTimeout(() => {
      void runCheck(false);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  const checkNow = async (): Promise<void> => {
    setError(null);
    setInfo(null);
    const infoResult = await runCheck(true);
    if (!infoResult && !error) setInfo("최신 버전입니다");
  };

  const applyUpdate = async (): Promise<void> => {
    setError(null);
    setInfo(null);
    setProgress(0);
    let totalBytes: number | null = null;
    let downloaded = 0;
    try {
      await platform.downloadAndInstallUpdate((event: UpdateProgressEvent) => {
        if (event.kind === "started") {
          totalBytes = event.contentLength;
          downloaded = 0;
          setProgress(0);
        } else if (event.kind === "progress") {
          downloaded += event.downloaded;
          if (totalBytes && totalBytes > 0) {
            setProgress(Math.min(1, downloaded / totalBytes));
          }
        } else if (event.kind === "finished") {
          setProgress(1);
        }
      });
      // relaunch 가 호출되므로 여기 도달 안 함. 도달 시 fallback.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[barosit][updater] install failed", e);
      setError(`업데이트 설치 실패: ${msg}`);
      setProgress(null);
    }
  };

  const snooze = (): void => {
    if (available) localStorage.setItem(SNOOZE_VERSION_KEY, available.version);
    setAvailable(null);
  };

  const dismissError = (): void => setError(null);
  const dismissInfo = (): void => setInfo(null);

  return {
    available,
    progress,
    error,
    info,
    checkNow,
    applyUpdate,
    snooze,
    dismissError,
    dismissInfo,
  };
}
