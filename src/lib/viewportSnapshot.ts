/**
 * Reload 시 사용자가 정지된 화면처럼 인지하도록, video element + SilhouetteOverlay
 * canvas 를 합성해 JPEG dataURL 로 sessionStorage 에 저장하고 다음 페이지 로드 때
 * fixed full-screen <img> 로 잠깐 표시.
 *
 * Why: useMemoryReloadGuard 가 분 단위로 페이지를 새로고침해 V8 외부 메모리를
 * 회수하는데, reload 직후 첫 MediaPipe 추론 결과가 LandmarkOverlay 의 졸라맨
 * 프레임으로 한순간 노출되어 거슬렸다. snapshot 으로 가리면 사용자는 reload
 * 자체를 인지하지 못한다.
 */

const STORAGE_KEY = "barosit:reload_snapshot";
const STORAGE_AT_KEY = "barosit:reload_snapshot_at";
const STORAGE_RECT_KEY = "barosit:reload_snapshot_rect";
/** snapshot 이 너무 오래되면 의미 없음 (사용자가 의도적 새로고침 등). */
const MAX_AGE_MS = 5_000;

export interface CaptureTargets {
  video: HTMLVideoElement | null;
  silhouetteCanvas: HTMLCanvasElement | null;
}

// SilhouetteOverlay 내부의 raw silhouette canvas (offRef) 를 module 변수로
// 보관. 화면 표시용 canvas 는 silhouette + 어깨/팔 라인 + face mesh dots 가
// 모두 합성돼 있어 캡처 시 점/선이 "졸라맨"으로 보였음. raw silhouette 만
// 들어 있는 offRef 를 따로 받아 캡처하면 점/선 없는 깨끗한 silhouette 만
// snapshot 됨.
let silhouetteSourceCanvas: HTMLCanvasElement | null = null;

export function registerSilhouetteSource(canvas: HTMLCanvasElement | null): void {
  silhouetteSourceCanvas = canvas;
}

export function getSilhouetteSource(): HTMLCanvasElement | null {
  return silhouetteSourceCanvas;
}

export interface SnapshotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface LoadedSnapshot {
  dataURL: string;
  rect: SnapshotRect | null;
}

/**
 * silhouette canvas 만 transparent PNG 로 캡처. video frame 은 의도적으로
 * 제외 — 새 페이지에서 카메라 stream 이 다시 시작되며 보여줄 새 영상과
 * snapshot 의 정지 영상이 미세하게 달라 "티"가 나는 문제를 회피.
 * 배경이 transparent 라 새 페이지의 실시간 video element 가 자연스럽게
 * snapshot 뒤로 비치고, silhouette 만 정지된 frame 으로 표시된다.
 * LandmarkOverlay 는 첫 mask + RAF 2 frame 지연으로 따로 차단됨.
 */
export function captureMonitorSnapshot(targets: CaptureTargets): string | null {
  const { silhouetteCanvas } = targets;
  if (!silhouetteCanvas || silhouetteCanvas.width === 0) return null;

  // 메모리 절약 + sessionStorage quota (5MB) 대비 최대 폭 1024 로 scale down.
  const sourceW = silhouetteCanvas.width;
  const sourceH = silhouetteCanvas.height;
  const scale = Math.min(1, 1024 / sourceW);
  const outW = Math.round(sourceW * scale);
  const outH = Math.round(sourceH * scale);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  try {
    ctx.drawImage(silhouetteCanvas, 0, 0, outW, outH);
  } catch {
    return null;
  }

  try {
    // PNG 로 transparency 보존. silhouette 영역만 그려져 있어 파일 크기 작음.
    return out.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function saveSnapshot(dataURL: string, rect?: SnapshotRect): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, dataURL);
    sessionStorage.setItem(STORAGE_AT_KEY, String(Date.now()));
    if (rect) {
      sessionStorage.setItem(STORAGE_RECT_KEY, JSON.stringify(rect));
    } else {
      sessionStorage.removeItem(STORAGE_RECT_KEY);
    }
  } catch {
    /* sessionStorage quota 초과 등 — 무시 */
  }
}

export function loadSnapshot(): LoadedSnapshot | null {
  try {
    const at = Number(sessionStorage.getItem(STORAGE_AT_KEY) ?? "0");
    if (!at || Date.now() - at > MAX_AGE_MS) {
      clearSnapshot();
      return null;
    }
    const dataURL = sessionStorage.getItem(STORAGE_KEY);
    if (!dataURL) return null;
    const rectRaw = sessionStorage.getItem(STORAGE_RECT_KEY);
    let rect: SnapshotRect | null = null;
    if (rectRaw) {
      try {
        rect = JSON.parse(rectRaw) as SnapshotRect;
      } catch {
        rect = null;
      }
    }
    return { dataURL, rect };
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_AT_KEY);
    sessionStorage.removeItem(STORAGE_RECT_KEY);
  } catch {
    /* noop */
  }
}
