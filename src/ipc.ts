// 이 모듈은 하위 호환용 thin re-export 레이어. 신규 코드는 `./platform`에서
// 직접 import 권장. 기존 호출처가 점진적으로 마이그레이션되기 전까지 유지.

import { platform } from "./platform";
import type { AlertPayload, PlatformAPI } from "./platform";
import type { PostureStatus } from "./pose/types";

export {
  isMinibarVisible,
  loadAppMode,
  saveAppMode,
  setMinibarVisible,
} from "./platform/storage";

export type {
  AlertPayload,
  AppMode,
  PlatformAPI,
  WidgetLastAlarm,
  WidgetState,
} from "./platform";

export const publishWidgetState: PlatformAPI["publishWidgetState"] = (s) =>
  platform.publishWidgetState(s);
export const onWidgetState: PlatformAPI["onWidgetState"] = (cb) =>
  platform.onWidgetState(cb);
export const setWidgetVisible: PlatformAPI["setWidgetVisible"] = (v) =>
  platform.setWidgetVisible(v);
export const hideMainWindow: PlatformAPI["hideMainWindow"] = () =>
  platform.hideMainWindow();
export const quitApp: PlatformAPI["quitApp"] = () => platform.quitApp();
export const switchToMainMode: PlatformAPI["switchToMainMode"] = () =>
  platform.switchToMainMode();
export const switchToWidgetMode: PlatformAPI["switchToWidgetMode"] = () =>
  platform.switchToWidgetMode();
export const showPostureAlert = (payload: AlertPayload): Promise<void> =>
  platform.showPostureAlert(payload);
export const updateStatus = (status: PostureStatus): Promise<void> =>
  platform.updateStatus(status);
export const showMainWindow: PlatformAPI["showMainWindow"] = () =>
  platform.showMainWindow();
export const onPauseEvent: PlatformAPI["onPauseEvent"] = (cb) =>
  platform.onPauseEvent(cb);
export const onResumeEvent: PlatformAPI["onResumeEvent"] = (cb) =>
  platform.onResumeEvent(cb);
export const onTogglePauseEvent: PlatformAPI["onTogglePauseEvent"] = (cb) =>
  platform.onTogglePauseEvent(cb);
export const onMainCloseRequested: PlatformAPI["onMainCloseRequested"] = (cb) =>
  platform.onMainCloseRequested(cb);
export const onMainReopened: PlatformAPI["onMainReopened"] = (cb) =>
  platform.onMainReopened(cb);
export const showAlertWindow: PlatformAPI["showAlertWindow"] = () =>
  platform.showAlertWindow();
export const hideAlertWindow: PlatformAPI["hideAlertWindow"] = () =>
  platform.hideAlertWindow();
export const emitAlertFired: PlatformAPI["emitAlertFired"] = (p) =>
  platform.emitAlertFired(p);
export const onAlertFired: PlatformAPI["onAlertFired"] = (cb) =>
  platform.onAlertFired(cb);
export const emitBreakReminder: PlatformAPI["emitBreakReminder"] = (p) =>
  platform.emitBreakReminder(p);
export const onBreakReminder: PlatformAPI["onBreakReminder"] = (cb) =>
  platform.onBreakReminder(cb);
export const emitCumulativeAlert: PlatformAPI["emitCumulativeAlert"] = (p) =>
  platform.emitCumulativeAlert(p);
export const onCumulativeAlert: PlatformAPI["onCumulativeAlert"] = (cb) =>
  platform.onCumulativeAlert(cb);
export const emitVariabilityAlert: PlatformAPI["emitVariabilityAlert"] = (p) =>
  platform.emitVariabilityAlert(p);
export const onVariabilityAlert: PlatformAPI["onVariabilityAlert"] = (cb) =>
  platform.onVariabilityAlert(cb);
export const emitForceBlur: PlatformAPI["emitForceBlur"] = (p) =>
  platform.emitForceBlur(p);
export const onForceBlur: PlatformAPI["onForceBlur"] = (cb) =>
  platform.onForceBlur(cb);
