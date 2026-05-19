// 새 버전 사용 가능 시 우측 하단 배너. 메인 윈도우 안에서만 표시 (모드 무관).
// 다운로드 중에는 진행률 표시. 완료 시 자동 relaunch 되므로 별도 처리 없음.

import type { UpdaterState } from "../updater";

interface Props {
  state: UpdaterState;
}

export function UpdateNotice({ state }: Props) {
  const { available, progress, error, applyUpdate, snooze, dismissError } = state;

  if (error) {
    return (
      <div className="b-update-notice b-update-error">
        <div className="b-update-title">⚠ {error}</div>
        <button className="b-btn b-btn-quiet" onClick={dismissError}>
          닫기
        </button>
      </div>
    );
  }

  if (!available) return null;

  const downloading = progress !== null;
  const pct = progress !== null ? Math.round(progress * 100) : 0;

  return (
    <div className="b-update-notice">
      <div className="b-update-title">새 버전 {available.version} 사용 가능</div>
      {available.body && !downloading && (
        <div className="b-update-body">{available.body.slice(0, 200)}</div>
      )}
      {downloading ? (
        <>
          <div className="b-update-progress">
            <div
              className="b-update-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="b-update-progress-label">
            {pct < 100 ? `다운로드 중… ${pct}%` : "설치 중…"}
          </div>
        </>
      ) : (
        <div className="b-update-actions">
          <button className="b-btn b-btn-quiet" onClick={snooze}>
            나중에
          </button>
          <button className="b-btn b-btn-primary" onClick={applyUpdate}>
            적용 후 재시작
          </button>
        </div>
      )}
    </div>
  );
}
