import type { Landmarks, PostureStatus, PostureType } from "../pose/types";
import type { BreakStatus } from "../pose/breakTracker";

export interface WidgetLastAlarm {
  type: PostureType;
  at: number;
}

export interface WidgetState {
  status: PostureStatus;
  score: number;
  away: boolean;
  violations: PostureType[];
  lastAlarm: WidgetLastAlarm | null;
  /** 활성 위반 중 가장 오래 지속된 시간(초). 위반 없으면 0. */
  maxDurationSecs: number;
  /** 단계적 알림 강도: 0(평소)/1(0-15s)/2(15-30s)/3(30-60s)/4(60s+) */
  stage: 0 | 1 | 2 | 3 | 4;
  /** 미니 실루엣 렌더링용 포즈 랜드마크 (저빈도 갱신). null이면 표시 안 함 */
  pose: Landmarks | null;
  /** 정기 휴식 알림 상태 — 연속 착석 시간 추적. null이면 표시 안 함. */
  breakStatus: BreakStatus | null;
}

export interface AlertPayload {
  posture_type: PostureType;
  duration_secs: number;
  severity: "warning" | "bad";
  coaching_message: string | null;
  /** OS 알림 제목 — i18n 로컬라이즈 문자열. 네이티브(Rust)로 전달. */
  title?: string;
  /** coaching_message 가 없을 때의 로컬라이즈 폴백 본문. */
  body_fallback?: string;
}

export type Unsubscribe = () => void;

/** 플랫폼별로 켜고 끄는 기능 플래그. 컴포넌트는 `IS_WEB` 직접 분기 대신
 *  이 capability를 보고 UI를 노출/숨김 처리한다. 양 플랫폼 코드가 같은
 *  컴포넌트 파일에 남아 한 곳에서 유지보수 가능. */
export interface PlatformFeatures {
  /** 다중 윈도우(메인 + 플로팅 위젯) 지원 — 웹은 false */
  multiWindow: boolean;
  /** OS 트레이/Dock 라이프사이클(닫기→트레이, Reopen 이벤트) — 웹은 false */
  trayLifecycle: boolean;
  /** 로그인 시 자동 시작 토글 노출 — 웹은 false */
  autostart: boolean;
  /** LLM 코칭 옵션 노출 — 웹 v1은 false, v2에서 true */
  llmCoaching: boolean;
  /** 앱 완전 종료 버튼 노출 — 웹은 false (브라우저는 탭 닫기) */
  appQuit: boolean;
  /** 자동 업데이트 — Tauri true, 웹 false (브라우저 새로고침이 업데이트) */
  autoUpdate: boolean;
}

/** 업데이트 사용 가능 정보. 없으면 null 반환. */
export interface UpdateInfo {
  /** 새 릴리스 버전 (예: "0.2.0") */
  version: string;
  /** 현재 앱 버전 */
  currentVersion: string;
  /** ISO date 또는 null */
  date: string | null;
  /** 릴리스 노트 (마크다운) — 없으면 null */
  body: string | null;
}

/** 다운로드/설치 진행 콜백 이벤트 */
export type UpdateProgressEvent =
  | { kind: "started"; contentLength: number | null }
  | { kind: "progress"; downloaded: number; contentLength: number | null }
  | { kind: "finished" };

/** 플랫폼 추상화 — Tauri 데스크톱과 웹 양쪽이 동일 인터페이스를 구현 */
export interface PlatformAPI {
  /** 컴포넌트가 분기 없이 참조할 기능 플래그 */
  features: PlatformFeatures;
  /** OS 또는 브라우저 알림 표시 */
  showPostureAlert(payload: AlertPayload): Promise<void>;
  /** 트레이 상태 또는 페이지 타이틀/파비콘 갱신 */
  updateStatus(status: PostureStatus): Promise<void>;
  /** 트레이 메뉴/툴팁 로컬라이즈 문자열을 네이티브로 전달 (웹: no-op) */
  setTrayI18n(labels: Record<string, string>): Promise<void>;
  /** 메인 윈도우 표시 (웹: no-op) */
  showMainWindow(): Promise<void>;
  /** 메인 윈도우 숨김 (웹: no-op) */
  hideMainWindow(): Promise<void>;
  /** 위젯 윈도우 가시성 토글 (웹: no-op) */
  setWidgetVisible(visible: boolean): Promise<void>;
  /** 앱 완전 종료 (웹: no-op) */
  quitApp(): Promise<void>;
  /** 메인 모드 진입 (웹: no-op — 항상 main) */
  switchToMainMode(): Promise<void>;
  /** 위젯 모드 진입 (웹: no-op) */
  switchToWidgetMode(): Promise<void>;
  /** 위젯/메인 윈도우 간 상태 브로드캐스트 */
  publishWidgetState(state: WidgetState): Promise<void>;
  onWidgetState(cb: (s: WidgetState) => void): Promise<Unsubscribe>;
  /** 외부 트리거로 모니터링 일시정지/재개 (트레이 메뉴 등) */
  onPauseEvent(cb: () => void): Promise<Unsubscribe>;
  onResumeEvent(cb: () => void): Promise<Unsubscribe>;
  onTogglePauseEvent(cb: () => void): Promise<Unsubscribe>;
  /** 메인 X 클릭 → JS가 위젯 모드 전환 처리하도록 신호 (웹: 호출 안 됨) */
  onMainCloseRequested(cb: () => void): Promise<Unsubscribe>;
  /** Dock 클릭 → 메인 표시 후 JS가 메인 모드 복귀 처리 (웹: 호출 안 됨) */
  onMainReopened(cb: () => void): Promise<Unsubscribe>;
  /** LLM 코칭 메시지 생성. 웹/비활성 시 null. */
  generateCoachingMessage(opts: {
    apiKey: string;
    postureType: PostureType;
    durationSecs: number;
    todayCountForType: number;
    hour: number;
  }): Promise<string | null>;
  /** 로그인 시 자동 시작 상태 조회. 웹/미지원 시 null. */
  isAutostartEnabled(): Promise<boolean | null>;
  /** 자동 시작 토글. 웹/미지원 시 no-op. */
  setAutostartEnabled(enabled: boolean): Promise<void>;
  /** 모니터링 시작에 필요한 권한(알림 등) 한 번 요청. Tauri는 OS 알림이
   *  Rust가 처리하므로 no-op. 웹은 Notification.requestPermission(). */
  requestPermissionsForMonitoring(): Promise<void>;
  /** 풀스크린 알림 오버레이 윈도우 표시 (데스크탑) — 다른 앱 위에 뜸. 웹은 no-op. */
  showAlertWindow(): Promise<void>;
  /** 풀스크린 알림 오버레이 숨김 (데스크탑). 웹은 no-op. */
  hideAlertWindow(): Promise<void>;
  /** 다른 윈도우(alert)에 알람 발사 정보 브로드캐스트. 웹은 no-op. */
  emitAlertFired(payload: {
    posture_type: PostureType;
    duration_secs: number;
    intensity: number;
    coaching_message: string | null;
  }): Promise<void>;
  /** alert 윈도우에서 발사 이벤트 수신 (다른 윈도우에서 emit한 것을 받음). */
  onAlertFired(
    cb: (payload: {
      posture_type: PostureType;
      duration_secs: number;
      intensity: number;
      coaching_message: string | null;
    }) => void,
  ): Promise<Unsubscribe>;
  /** 정기 휴식 알림(Phase 1) — 단계별 발사 정보 브로드캐스트. 웹은 no-op. */
  emitBreakReminder(payload: {
    stage: "micro" | "standup" | "deep";
    secs: number;
  }): Promise<void>;
  onBreakReminder(
    cb: (payload: { stage: "micro" | "standup" | "deep"; secs: number }) => void,
  ): Promise<Unsubscribe>;
  /** 누적 부하 알림 (Phase 2) — 윈도우 대비 누적 비율이 임계 초과 시. 웹은 no-op. */
  emitCumulativeAlert(payload: {
    posture_type: PostureType;
    secs: number;
    ratio: number;
  }): Promise<void>;
  onCumulativeAlert(
    cb: (payload: {
      posture_type: PostureType;
      secs: number;
      ratio: number;
    }) => void,
  ): Promise<Unsubscribe>;
  /** 자세 변동성 알림 (Phase 3) — 좋은 자세라도 정체 시. 웹은 no-op. */
  emitVariabilityAlert(payload: {
    movement_index: number;
    duration_secs: number;
  }): Promise<void>;
  onVariabilityAlert(
    cb: (payload: {
      movement_index: number;
      duration_secs: number;
    }) => void,
  ): Promise<Unsubscribe>;
  /** 현재 실행 중인 앱의 버전을 반환 */
  getAppVersion(): Promise<string>;
  /** 새 버전 확인. 없으면 null. 웹은 항상 null. */
  checkForUpdate(): Promise<UpdateInfo | null>;
  /** 업데이트 다운로드 + 설치 + 재시작. 진행 콜백으로 UI 갱신. */
  downloadAndInstallUpdate(
    onProgress?: (event: UpdateProgressEvent) => void,
  ): Promise<void>;
  /** 기본 브라우저에서 외부 URL 열기 (웹은 window.open) */
  openBrowser(url: string): Promise<void>;
  /** OS 전역 입력 유휴 시간(초) — 마지막 키보드/마우스 입력 이후 경과.
   *  포커스 앱과 무관한 시스템 전체 기준. 웹/미지원 시 0(항상 활성 간주). */
  systemIdleSecs(): Promise<number>;
}

export type AppMode = "main" | "widget";
