// 마케팅/앱 공통 슬로건. 메인은 고정, 서브는 요일·시간대 기반 결정적 로테이션.

export const MAIN_SLOGAN = "지금 바로, 바르게 Sit. 바로씻!";
export const MAIN_SLOGAN_LINE1 = "지금 바로, 바르게 Sit.";
export const MAIN_SLOGAN_LINE2 = "바로씻!";

// 요일 — getDay() 0=일요일 ~ 6=토요일
const DAY_SLOGANS: string[] = [
  "잊고 있던 나를 바로, 소중하게 Sit. 바로씻.",          // 일
  "오늘 하루도 바로, 내 몸을 위해 바르게 Sit. 바로씻.",  // 월
  "흐트러진 자세를 바로, 무너진 밸런스를 Sit. 바로씻.",  // 화
  "당당한 나를 위해 바로, 기분 좋게 Sit. 바로씻.",       // 수
  "목 빠지는 목요일. 바로씻!",                            // 목
  "어제보다 바로, 지금 바로 Sit. 바로씻.",                // 금
  "주말이라고 거북이는 NO, 바로씻!",                      // 토
];

// 시간대 특수성 — 요일보다 우선
const TIME_SLOGANS = {
  noon: "식후 굽음 주의, 바로씻!",                                  // 12-13시
  evening: "애쓰는 당신을 바로, 곁에서 챙겨주는 Sit. 바로씻.",      // 19시 이후
  late: "이 시간까지 굽지 마세요, 바로씻.",                          // 0-5시
};

/**
 * 현재 시각 기반으로 서브 슬로건 선택.
 * 같은 시간엔 같은 카피(예측 가능), 시간/요일 바뀌면 자동 전환.
 */
export function pickSubSlogan(now: Date = new Date()): string {
  const day = now.getDay();
  const hour = now.getHours();
  if (hour >= 12 && hour < 14) return TIME_SLOGANS.noon;
  if (hour >= 19) return TIME_SLOGANS.evening;
  if (hour < 6) return TIME_SLOGANS.late;
  return DAY_SLOGANS[day];
}
