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
          setReady(true);
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
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

    const onVisibility = () => {
      if (document.hidden) return;
      recover();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    // 슬립/덮개 닫힘에선 visibilitychange 가 안 떠 스트림이 죽은 채 남을 수 있다.
    // wake(타이머 드리프트) 신호로도 동일 복구.
    const unsubWake = subscribeWake(recover);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      unsubWake();
      if (retryTimer != null) window.clearTimeout(retryTimer);
      stop();
    };
  }, [enabled]);

  return { videoRef, ready, error };
}
