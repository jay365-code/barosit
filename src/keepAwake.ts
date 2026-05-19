/**
 * macOS Tauri WKWebView 는 윈도우가 다른 앱에 가려지면 페이지를 suspend 시켜
 * setTimeout/requestAnimationFrame 이 거의 정지된다. 결과적으로 pose loop 가
 * 안 돌아가서 검출이 멈춤.
 *
 * 무음 오디오 컨텍스트를 띄워두면 페이지가 "재생 중인 미디어" 로 인식되어
 * suspension 이 해제된다. 미디어 플레이어 / 비디오 통화 앱들이 사용하는 검증된
 * 트릭. CPU 영향 무시할 만함 (0Hz oscillator + gain 0).
 *
 * 시작: 사용자 제스처(앱 첫 인터랙션) 이후 호출해야 AudioContext 가
 * suspended 상태로 안 빠진다. enabled=true 인 동안만 유지.
 */

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let started = false;

export function startKeepAwake(): void {
  if (started) return;
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 0;
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    // 일부 환경에서 AudioContext 가 suspended 상태로 시작될 수 있어 resume 시도
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => undefined);
    }
    started = true;
  } catch {
    /* keepAwake 실패해도 앱 기능에는 영향 없음 — silent fail. */
  }
}

export function stopKeepAwake(): void {
  if (!started) return;
  try {
    oscillator?.stop();
    oscillator?.disconnect();
    gainNode?.disconnect();
    audioCtx?.close().catch(() => undefined);
  } catch {
    /* noop */
  }
  oscillator = null;
  gainNode = null;
  audioCtx = null;
  started = false;
}

export function isKeepAwakeActive(): boolean {
  return started;
}
