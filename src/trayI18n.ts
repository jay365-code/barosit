// 트레이 메뉴/툴팁 로컬라이즈 문자열을 네이티브(Rust)로 전달.
// i18n(tray 네임스페이스)이 단일 진실원이며, 시작 시 + 언어 변경 시 push 한다.
// 키 이름은 Rust 의 TrayI18n 필드명(snake_case)과 1:1 일치해야 한다.
import i18n from "./i18n";
import { registerTrayPush } from "./i18n/lang";
import { platform } from "./platform";

function buildTrayLabels(): Record<string, string> {
  return {
    show: i18n.t("tray:show"),
    pause: i18n.t("tray:pause"),
    resume: i18n.t("tray:resume"),
    quit: i18n.t("tray:quit"),
    tooltip_monitoring: i18n.t("tray:tooltipMonitoring"),
    tooltip_good: i18n.t("tray:tooltipGood"),
    tooltip_warning: i18n.t("tray:tooltipWarning"),
    tooltip_bad: i18n.t("tray:tooltipBad"),
    tooltip_paused: i18n.t("tray:tooltipPaused"),
    tooltip_resting: i18n.t("tray:tooltipResting"),
  };
}

export function pushTrayI18n(): void {
  platform.setTrayI18n(buildTrayLabels()).catch(() => undefined);
}

/** 메인 윈도우 시작 시 1회 호출 — 초기 push + 언어 변경 구독 등록. */
export function initTrayI18n(): void {
  registerTrayPush(() => pushTrayI18n());
  pushTrayI18n();
}
