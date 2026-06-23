import { useEffect, useRef, useState } from "react";
import { subscribeWake } from "../wakeDetector";
import i18n from "../i18n";

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: string | null;
}

function friendlyCameraError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  const raw = e instanceof Error ? e.message : String(e);
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return i18n.t("errors:camera.denied");
    case "NotFoundError":
    case "DevicesNotFoundError":
      return i18n.t("errors:camera.notFound");
    case "NotReadableError":
    case "TrackStartError":
      return i18n.t("errors:camera.inUse");
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return i18n.t("errors:camera.unsupported");
    case "AbortError":
      return i18n.t("errors:camera.aborted");
    default:
      return raw || i18n.t("errors:camera.unknown");
  }
}

export function useCamera(enabled: boolean = true): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;

    const isStreamLive = (): boolean =>
      !!stream && stream.getTracks().some((t) => t.readyState === "live");

    const stop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    let retryTimer: number | null = null;
    const start = async () => {
      try {
        if (cancelled) return;
        if (isStreamLive()) {
          await videoRef.current?.play().catch(() => undefined);
          // 스트림이 live 여도 실제 프레임이 흐르는지는 워치독이 readyState 로 확정.
          if ((videoRef.current?.readyState ?? 0) >= 2) setReady(true);
          return;
        }
        stop();
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 256 },
            height: { ideal: 192 },
            frameRate: { ideal: 30 },
            facingMode: "user",
          },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        // 트랙이 muted/ended 로 빠지면(다른 앱/창이 카메라 선점) 프레임이 끊긴다.
        // 이벤트로 즉시 재획득을 트리거해 검은 화면 고착을 막는다.
        s.getVideoTracks().forEach((t) => {
          t.addEventListener("ended", recover);
          t.addEventListener("mute", recover);
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // [핵심] getUserMedia 성공이 아니라 "실제 프레임 도착(readyState≥2)" 으로
        // ready 를 판정. 일부 webview 는 live 지만 muted 인 트랙을 돌려줘 play() 가
        // resolve 돼도 프레임이 0 → 검은 화면. 프레임이 올 때만 ready=true.
        if (videoRef.current && videoRef.current.readyState >= 2) {
          setReady(true);
        }
        setError(null);
      } catch (e) {
        setError(friendlyCameraError(e));
        setReady(false);
        // 다른 윈도우가 카메라 잡고 있을 수 있어 잠시 후 재시도
        if (!cancelled) {
          if (retryTimer != null) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            if (!cancelled && enabled) start();
          }, 800);
        }
      }
    };

    const recover = () => {
      // 스트림이 죽었으면 재시작, 살아있는데 paused면 resume.
      if (!isStreamLive()) {
        setReady(false);
        start();
      } else {
        videoRef.current?.play().catch(() => undefined);
      }
    };

    // 실제 비디오가 디코딩한 프레임이 도착하면 그때 ready 확정.
    const onLoadedData = () => {
      if (!cancelled && (videoRef.current?.readyState ?? 0) >= 2) setReady(true);
    };

    // [프레임 워치독] 스트림이 live 라고 보고돼도 실제 프레임이 멈추는 경우
    // (track muted, webview decode stall, reload 직후 재획득 레이스)를 currentTime
    // 정지로 감지해 강제 재획득한다. DEBUG 의 "no frame yet / fps=0" 고착의 직접 해소책.
    let lastVideoTime = -1;
    let stallCount = 0;
    const WATCHDOG_MS = 1500;
    const watchdog = window.setInterval(() => {
      if (cancelled) return;
      const v = videoRef.current;
      if (!v) return;
      // 스트림 자체가 죽었으면 즉시 재획득.
      if (!isStreamLive()) {
        stallCount = 0;
        recover();
        return;
      }
      const playingFrames = v.readyState >= 2 && v.currentTime !== lastVideoTime;
      if (playingFrames) {
        lastVideoTime = v.currentTime;
        stallCount = 0;
        if (!ready) setReady(true);
        return;
      }
      // 프레임이 안 흐름 — 2회 연속(=~3s) 지속되면 stream 을 버리고 재획득.
      stallCount += 1;
      if (stallCount >= 2) {
        stallCount = 0;
        setReady(false);
        stop(); // 선점/muted 트랙을 명확히 놓아주고 깨끗이 다시 잡는다.
        start();
      }
    }, WATCHDOG_MS);

    const onVisibility = () => {
      if (document.hidden) return;
      recover();
    };

    start();
    videoRef.current?.addEventListener("loadeddata", onLoadedData);
    document.addEventListener("visibilitychange", onVisibility);
    // 슬립/덮개 닫힘에선 visibilitychange 가 안 떠 스트림이 죽은 채 남을 수 있다.
    // wake(타이머 드리프트) 신호로도 동일 복구.
    const unsubWake = subscribeWake(recover);

    return () => {
      cancelled = true;
      window.clearInterval(watchdog);
      videoRef.current?.removeEventListener("loadeddata", onLoadedData);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubWake();
      if (retryTimer != null) window.clearTimeout(retryTimer);
      stop();
    };
  }, [enabled]);

  return { videoRef, ready, error };
}
