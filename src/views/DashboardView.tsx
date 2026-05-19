import { useMemo } from "react";
import {
  clearEvents,
  computeDailyStats,
  loadEvents,
  startOfToday,
  startOfWeek,
} from "../pose/eventLog";
import type { PostureType } from "../pose/types";

const POSTURE_LABELS: Record<PostureType, string> = {
  forward_head: "거북목",
  chin_resting: "턱 괴임",
  shoulder_tilt: "어깨 기울임",
  slouching: "등 구부정",
  monitor_too_close: "모니터 거리",
  shoulder_asymmetry: "어깨 비대칭",
  head_roll: "머리 좌우 기울임",
};

interface Props {
  refreshKey: number;
  onCleared: () => void;
}

export function DashboardView({ refreshKey, onCleared }: Props) {
  const stats = useMemo(() => {
    const events = loadEvents();
    const now = Date.now() + 1; // include events at exact "now"
    return {
      today: computeDailyStats(events, startOfToday(), now),
      week: computeDailyStats(events, startOfWeek(), now),
    };
    // refreshKey forces recompute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const maxHour = Math.max(...stats.today.byHour, 1);

  return (
    <div className="settings">
      <h2 style={{ margin: 0 }}>대시보드</h2>

      <div className="setting-row">
        <label>오늘</label>
        <div className="desc">
          총 {stats.today.total}회 자세 알림
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          {(Object.keys(POSTURE_LABELS) as PostureType[]).map((t) => (
            <div key={t} style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="desc">{POSTURE_LABELS[t]}</span>
              <strong>{stats.today.byType[t]}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <label>오늘 시간대별 분포</label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(24, 1fr)",
            gap: "2px",
            alignItems: "end",
            height: "80px",
            marginTop: "0.4rem",
          }}
        >
          {stats.today.byHour.map((count, h) => (
            <div
              key={h}
              title={`${h}시: ${count}회`}
              style={{
                background: count > 0 ? "var(--accent)" : "var(--surface-2)",
                height: `${Math.max(4, (count / maxHour) * 100)}%`,
                borderRadius: "2px",
              }}
            />
          ))}
        </div>
        <div className="desc" style={{ marginTop: "0.4rem" }}>
          0시 ~ 23시
        </div>
      </div>

      <div className="setting-row">
        <label>이번 주</label>
        <div className="desc">총 {stats.week.total}회</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          {(Object.keys(POSTURE_LABELS) as PostureType[]).map((t) => (
            <div key={t} style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="desc">{POSTURE_LABELS[t]}</span>
              <strong>{stats.week.byType[t]}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => {
            if (confirm("모든 자세 이력을 삭제할까요?")) {
              clearEvents();
              onCleared();
            }
          }}
        >
          이력 전체 삭제
        </button>
      </div>
    </div>
  );
}
