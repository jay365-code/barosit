// 자세(posture) 라벨/코칭 공유 헬퍼 — 여러 화면에 중복돼 있던
// POSTURE_LABEL / COACHING 맵을 posture·coaching 네임스페이스로 통합.
import type { TFunction } from "i18next";
import i18n from "./index";
import type { PostureType } from "../pose/types";

/** 자세 유형 표시 라벨 (예: forward_head → "거북목") */
export function postureLabel(type: PostureType, t: TFunction = i18n.t): string {
  return t(`posture:label.${type}`);
}

/** OS 알림용 자세 제목 (예: forward_head → "거북목 자세 감지") */
export function postureAlertTitle(type: PostureType, t: TFunction = i18n.t): string {
  return t(`posture:alertTitle.${type}`);
}

/** 자세 코칭 한 줄 (정적 다국어) */
export function postureCoaching(type: PostureType, t: TFunction = i18n.t): string {
  return t(`coaching:tip.${type}`);
}
