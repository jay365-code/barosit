// 사용자 프로필 페이지 — Phase 0: 로컬 stub.
// - 이름·아바타·작업환경 입력 (localStorage user_profile_v1)
// - "로그인 / 회원가입" 섹션은 비활성 안내 (Phase 1 예정)
// - "홈으로" 버튼 → 메인 모니터 화면 복귀

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import {
  DEFAULT_AVATAR_OPTIONS,
  WORK_ENV_LABEL,
  loadProfile,
  saveProfile,
  type UserProfile,
  type WorkEnv,
} from "../userProfile";

interface Props {
  onGoHome: () => void;
}

export function ProfileView({ onGoHome }: Props) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 자동 저장 — 입력 후 600ms debounce
  useEffect(() => {
    const t = setTimeout(() => {
      saveProfile(profile);
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [profile]);

  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  return (
    <div className="profile-view">
      <header className="profile-header">
        <button
          type="button"
          className="b-btn b-btn-ghost"
          onClick={onGoHome}
          aria-label="홈으로"
        >
          <Icon name="chev-l" size={14} />
          홈으로
        </button>
        <h1 className="profile-title">프로필</h1>
        <div style={{ minWidth: 80 }} />
      </header>

      <div className="profile-body">
        {/* 인증 안내 — Phase 1 예정 */}
        <section className="profile-card profile-auth-soon">
          <div className="profile-card-head">
            <Icon name="shield" size={16} />
            <span>로그인 / 회원가입</span>
            <span className="profile-pill">준비 중</span>
          </div>
          <p className="profile-card-sub">
            여러 기기에서 자세 점수·이력을 동기화하려면 계정이 필요해요.
            다음 업데이트에 추가될 예정입니다.
          </p>
          <div className="profile-card-actions">
            <button type="button" className="b-btn b-btn-primary" disabled>
              로그인
            </button>
            <button type="button" className="b-btn b-btn-ghost" disabled>
              회원가입
            </button>
          </div>
        </section>

        {/* 아바타 선택 */}
        <section className="profile-card">
          <div className="profile-card-head">
            <span>아바타</span>
          </div>
          <div className="profile-avatar-grid">
            {DEFAULT_AVATAR_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className={`profile-avatar-cell ${profile.avatar === a ? "is-selected" : ""}`}
                onClick={() => update("avatar", a)}
                aria-label={`아바타 ${a}`}
              >
                {a}
              </button>
            ))}
          </div>
        </section>

        {/* 이름 */}
        <section className="profile-card">
          <label htmlFor="profile-name" className="profile-card-head">
            <span>표시 이름</span>
          </label>
          <input
            id="profile-name"
            className="profile-input"
            placeholder="예: 정홍"
            value={profile.name}
            maxLength={24}
            onChange={(e) => update("name", e.target.value)}
          />
          <p className="profile-card-sub">
            앱 내부에서만 사용해요. 인증 단계에서 계정명과 분리됩니다.
          </p>
        </section>

        {/* 작업 환경 */}
        <section className="profile-card">
          <div className="profile-card-head">
            <span>주 작업 환경</span>
          </div>
          <div className="profile-radio-row">
            {(Object.keys(WORK_ENV_LABEL) as WorkEnv[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`profile-radio ${profile.workEnv === k ? "is-selected" : ""}`}
                onClick={() => update("workEnv", k)}
              >
                {WORK_ENV_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="profile-card-sub">
            앞으로 작업 환경에 따라 자세 분석 보정 옵션이 추가될 수 있어요.
          </p>
        </section>

        <div className="profile-saved-hint">
          {savedAt ? "자동 저장됨" : "변경 사항이 자동 저장됩니다"}
        </div>
      </div>
    </div>
  );
}
