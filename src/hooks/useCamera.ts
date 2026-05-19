import { useEffect, useRef, useState } from "react";

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
      return "카메라 권한이 거부됐어요. 시스템 설정에서 BaroSit에 카메라 권한을 허용해주세요.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "사용 가능한 카메라를 찾지 못했어요. 외장 웹캠을 연결했다면 USB를 다시 꽂아보세요.";
    case "NotReadableError":
    case "TrackStartError":
      return "다른 앱이 카메라를 사용 중이에요. Zoom, Photo Booth, 브라우저 탭 등을 종료한 뒤 다시 시도해주세요.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "이 카메라는 요청한 설정을 지원하지 않아요.";
    case "AbortError":
      return "카메라 시작이 취소됐어요. 잠시 후 다시 시도해주세요.";
    default:
      return raw || "알 수 없는 카메라 오류가 발생했어요.";
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

    const onVisibility = () => {
      if (document.hidden) return;
      // 윈도우가 다시 보였을 때 스트림이 죽었으면 재시작
      if (!isStreamLive()) {
        setReady(false);
        start();
      } else {
        // 스트림 살아있어도 video가 paused 상태일 수 있어 resume 시도
        videoRef.current?.play().catch(() => undefined);
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      stop();
    };
  }, [enabled]);

  return { videoRef, ready, error };
}
