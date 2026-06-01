import { useEffect, useRef, useState } from "react";
import { platform } from "../platform";
import { subscribeWake } from "../wakeDetector";

const POLL_MS = 4000;
// 얼굴이 이만큼 안 보이면 카메라 기준 자리비움.
const FACE_AWAY_MS = 8000;
// 자리비움 + OS 입력이 이만큼 없으면 = 사용자가 작업을 멈춤 → 카메라까지 끔.
const IDLE_SUSPEND_SECS = 60;
// suspend 중 입력 유휴가 이 값 미만이면(=방금 키보드/마우스 입력) 작업 재개로 보고 복귀.
const ACTIVE_RESUME_SECS = 3;

/**
 * "사용자가 작업을 멈춘" 순간 카메라까지 꺼서 시스템 배터리 보호(화면보호기/디스플레이
 * 절전/유휴 잠자기)가 정상 작동하게 한다. 복귀 감지는 카메라가 아니라 OS 전역 입력
 * 신호로 한다 — 카메라가 꺼져 있어도 사용자가 키보드/마우스를 만지면(=작업 재개) 즉시
 * 재개. 시스템이 잤다 깨어나거나 창이 포커스돼도 재개.
 *
 * suspend 조건 = 카메라 기준 자리비움(얼굴 없음) AND OS 입력 장시간 없음.
 * 얼굴이 보이면(읽는 중 등 입력만 멈춤) suspend 하지 않는다 — 자세 모니터링 지속.
 *
 * @param lastPresentAtRef 마지막으로 얼굴/포즈가 잡힌 시각(ms). MonitorView 의 ref 재사용.
 * @returns suspended — true면 카메라를 꺼야 함.
 */
export function useIdleSuspend(lastPresentAtRef: { current: number }): boolean {
  const [suspended, setSuspended] = useState(false);
  const presentRef = useRef(lastPresentAtRef);
  presentRef.current = lastPresentAtRef;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const idle = await platform.systemIdleSecs();
      if (cancelled) return;
      const faceAway = Date.now() - presentRef.current.current > FACE_AWAY_MS;
      setSuspended((cur) => {
        if (!cur) {
          // 자리비움 + 장시간 입력 없음 → 카메라 off.
          return faceAway && idle >= IDLE_SUSPEND_SECS;
        }
        // suspend 중: 입력이 들어오면(유휴 리셋) 재개.
        return idle >= ACTIVE_RESUME_SECS;
      });
    };

    const id = window.setInterval(poll, POLL_MS);
    poll();

    // 깨어남(슬립/덮개 닫힘 복귀) / 창 포커스 = 작업 재개 → 즉시 해제.
    const resume = () => setSuspended(false);
    const unsubWake = subscribeWake(resume);
    window.addEventListener("focus", resume);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsubWake();
      window.removeEventListener("focus", resume);
    };
  }, []);

  return suspended;
}
