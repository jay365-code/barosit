import { useEffect, useState } from "react";
import { supabase } from "../auth/supabase";
import { Icon } from "../components/Icon";

interface UserProfileData {
  id: string;
  name: string;
  avatar: string;
  work_env: string;
  is_admin: boolean;
  created_at: string;
  email?: string; // supabase auth에서 가입 시 바인딩할 수 있음
}

interface SubscriptionData {
  id: string;
  user_id: string;
  plan_id: string; // 'free', 'pro', 'premium'
  status: string; // 'active', 'inactive'
  current_period_end: string | null;
  updated_at: string;
}

interface PostureEventData {
  id: string;
  user_id: string;
  posture_type: string;
  duration_secs: number;
  occurred_at: string;
}

interface DailyScoreData {
  user_id: string;
  date: string;
  avg_score: number;
  violation_count: number;
  stretch_count: number;
}

interface PostData {
  id: string;
  user_id: string;
  title: string;
  content: string;
  views: number;
  likes: number;
  created_at: string;
}

interface CommentData {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

export function AdminDashboardView({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "qna" | "system">("dashboard");
  const [loading, setLoading] = useState(true);
  
  // 데이터 상태
  const [profiles, setProfiles] = useState<UserProfileData[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [events, setEvents] = useState<PostureEventData[]>([]);
  const [dailyScores, setDailyScores] = useState<DailyScoreData[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [comments, setComments] = useState<CommentData[]>([]);
  
  // 시스템 관리 상태
  const [cleanLog, setCleanLog] = useState<string[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isGeneratingMock, setIsGeneratingMock] = useState(false);

  // Q&A 특정 선택물 답변 상태
  const [selectedPost, setSelectedPost] = useState<PostData | null>(null);
  const [newCommentText, setNewCommentText] = useState("");

  // 데이터 로드 함수
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. 프로필 목록 조회
      const { data: profData } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      
      // 2. 구독 정보 조회
      const { data: subData } = await supabase.from("user_subscriptions").select("*");
      
      // 3. 최근 원시 이벤트 조회 (최대 1000건 제한으로 부하 예방)
      const { data: evtData } = await supabase.from("posture_events").select("*").order("occurred_at", { ascending: false }).limit(1000);
      
      // 4. 일일 스코어 조회
      const { data: scoreData } = await supabase.from("daily_scores").select("*").order("date", { ascending: false });

      // 5. Q&A 포스트 조회
      const { data: postData } = await supabase.from("posts").select("*").order("created_at", { ascending: false });

      // 6. Q&A 댓글 조회
      const { data: commentData } = await supabase.from("comments").select("*").order("created_at", { ascending: true });

      setProfiles(profData || []);
      setSubscriptions(subData || []);
      setEvents(evtData || []);
      setDailyScores(scoreData || []);
      setPosts(postData || []);
      setComments(commentData || []);
    } catch (err) {
      console.error("[AdminDashboard] Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 1. 구독 플랜 변경 핸들러
  const handleUpdatePlan = async (userId: string, planId: string, status: string) => {
    try {
      const { error } = await supabase
        .from("user_subscriptions")
        .upsert({
          user_id: userId,
          plan_id: planId,
          status: status,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (error) throw error;
      
      // 상태 즉시 리로드
      const { data: updatedSubs } = await supabase.from("user_subscriptions").select("*");
      setSubscriptions(updatedSubs || []);
      alert("구독 요금제 플랜이 정상 수정되었습니다!");
    } catch (err: any) {
      alert("플랜 수정 실패: " + err.message);
    }
  };

  // 2. Q&A 게시물 삭제 핸들러
  const handleDeletePost = async (postId: string) => {
    if (!confirm("정말 이 질문글을 삭제하시겠습니까? 관련 댓글도 모두 함께 영구 삭제됩니다.")) return;
    try {
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) throw error;
      
      setPosts(prev => prev.filter(p => p.id !== postId));
      setComments(prev => prev.filter(c => c.post_id !== postId));
      if (selectedPost?.id === postId) setSelectedPost(null);
      alert("게시물이 성공적으로 삭제되었습니다.");
    } catch (err: any) {
      alert("게시물 삭제 실패: " + err.message);
    }
  };

  // 3. Q&A 댓글 삭제 핸들러
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("정말 이 댓글을 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
      
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err: any) {
      alert("댓글 삭제 실패: " + err.message);
    }
  };

  // 4. 어드민 답변(댓글) 작성 핸들러
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !newCommentText.trim()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from("comments")
        .insert([{
          post_id: selectedPost.id,
          user_id: session.user.id,
          content: newCommentText.trim(),
        }])
        .select();

      if (error) throw error;

      if (data) {
        setComments(prev => [...prev, ...data]);
      }
      setNewCommentText("");
    } catch (err: any) {
      alert("답변 등록 실패: " + err.message);
    }
  };

  // 5. 90일 미활동 데이터 만료 청소 (수동 실행)
  const handlePurgeData = async (dryRun: boolean) => {
    setIsCleaning(true);
    setCleanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${dryRun ? "모의 실행" : "실제 실행"} 청소 가동...`]);
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoffStr = cutoffDate.toISOString();

      // 90일 경과 대상 건수 조회
      const { count, error: countErr } = await supabase
        .from("posture_events")
        .select("*", { count: "exact", head: true })
        .lt("occurred_at", cutoffStr);

      if (countErr) throw countErr;

      const targetCount = count || 0;
      setCleanLog(prev => [...prev, `- 90일 이전 데이터 검색 완료: 총 ${targetCount}건 발견.`]);

      if (!dryRun && targetCount > 0) {
        const { error: delErr } = await supabase
          .from("posture_events")
          .delete()
          .lt("occurred_at", cutoffStr);

        if (delErr) throw delErr;
        setCleanLog(prev => [...prev, `✓ 실제 데이터베이스에서 ${targetCount}건의 로그를 안전하게 영구 청소 완료했습니다!`]);
      } else {
        setCleanLog(prev => [...prev, `✓ 모의 실행이 성공적으로 끝났습니다. (데이터 변경 없음)`]);
      }

      await fetchAllData(); // 데이터 통계 갱신
    } catch (err: any) {
      setCleanLog(prev => [...prev, `✗ 실패: ${err.message}`]);
    } finally {
      setIsCleaning(false);
    }
  };

  // 6. QA 품질 보증용 모의 더미 데이터 주입기
  const handleInjectMockData = async () => {
    setIsGeneratingMock(true);
    setCleanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] QA 목적 모의 덤프 데이터 주입 시작...`]);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("로그인 세션이 확인되지 않습니다.");
      const currentUserId = session.user.id;

      // 무작위 날짜 및 시간 데이터 생성 헬퍼
      const randomDateWithinWeek = (offsetDays: number) => {
        const d = new Date();
        d.setDate(d.getDate() - offsetDays);
        d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
        return d;
      };

      // 1. 모의 posture_events 생성 (20건)
      const mockEvents = [];
      const postures = ["forward_head", "shoulder_tilt", "slouching", "chin_resting", "monitor_too_close"];
      for (let i = 0; i < 20; i++) {
        const offset = Math.floor(Math.random() * 7); // 최근 7일 내
        const randDate = randomDateWithinWeek(offset);
        mockEvents.push({
          user_id: currentUserId,
          device_id: "QA-Mock-Device",
          posture_type: postures[Math.floor(Math.random() * postures.length)],
          duration_secs: Math.floor(Math.random() * 90) + 10,
          occurred_at: randDate.toISOString()
        });
      }

      const { error: eventErr } = await supabase.from("posture_events").insert(mockEvents);
      if (eventErr) throw eventErr;
      setCleanLog(prev => [...prev, `- 20건의 가상 거북목 위반 로그(posture_events) 주입 성공`]);

      // 2. 모의 daily_scores 생성 (최근 7일)
      const mockScores = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        mockScores.push({
          user_id: currentUserId,
          date: dateStr,
          avg_score: Math.floor(Math.random() * 30) + 70, // 70~100점
          violation_count: Math.floor(Math.random() * 15) + 2,
          stretch_count: Math.floor(Math.random() * 5)
        });
      }

      const { error: scoreErr } = await supabase.from("daily_scores").upsert(mockScores, { onConflict: "user_id,date" });
      if (scoreErr) throw scoreErr;
      setCleanLog(prev => [...prev, `- 최근 7일치 일일 평균 점수 및 스트레칭 횟수(daily_scores) 주입/수정 성공`]);

      // 3. 모의 Q&A 포스트 주입 (2건)
      const mockPosts = [
        {
          user_id: currentUserId,
          title: "자세 진단 센서 정밀도가 어떤가요?",
          content: "노트북 카메라로 보는데 거북목을 엄청 예리하게 잘 잡아내네요! 어깨 비대칭도 피드백이 오나요?",
          views: 12,
          likes: 3,
        },
        {
          user_id: currentUserId,
          title: "맥북에서 위젯 모드 실행 오류 건",
          content: "위젯 미니바 전환 시 가끔 깜빡이는 현상이 있어요. 다음 업데이트에 고쳐지나요?",
          views: 8,
          likes: 1,
        }
      ];

      const { data: insertedPosts, error: postErr } = await supabase.from("posts").insert(mockPosts).select();
      if (postErr) throw postErr;
      setCleanLog(prev => [...prev, `- 2건의 모의 Q&A 질문글(posts) 등록 완료`]);

      // 4. 모의 댓글 주입 (1건)
      if (insertedPosts && insertedPosts.length > 0) {
        const { error: commErr } = await supabase.from("comments").insert([{
          post_id: insertedPosts[0].id,
          user_id: currentUserId,
          content: "어깨 비대칭은 마스크 실루엣 분석을 통해 좌우 어깨 봉우리 선 기울기를 연산하여 정밀하게 감지합니다!"
        }]);
        if (commErr) throw commErr;
        setCleanLog(prev => [...prev, `- 모의 질문에 대한 QA 자동 답변(comments) 주입 완료`]);
      }

      setCleanLog(prev => [...prev, `✓ QA용 더미 데이터 주입 성공! 차트 통계를 새로 고쳐주세요.`]);
      await fetchAllData();
    } catch (err: any) {
      setCleanLog(prev => [...prev, `✗ 주입 실패: ${err.message}`]);
    } finally {
      setIsGeneratingMock(false);
    }
  };

  // 통계 차트용 연산 데이터
  // 1. 시간대별 빈도수 (24시간)
  const hourCounts = new Array(24).fill(0);
  events.forEach(e => {
    const hour = new Date(e.occurred_at).getHours();
    hourCounts[hour]++;
  });

  // 2. 위반 유형별 비중
  const typeCounts: Record<string, number> = {};
  events.forEach(e => {
    typeCounts[e.posture_type] = (typeCounts[e.posture_type] || 0) + 1;
  });

  const postureTypes = Object.keys(typeCounts);
  const totalViolations = events.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 10, 10, 0.75)",
        backdropFilter: "blur(12px)",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 1080,
          height: "85vh",
          background: "rgba(30, 30, 30, 0.8)",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 상단 헤더 */}
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #5b8c7a, #3c5e52)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="settings" size={18} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}>BaroSit 어드민 제어 센터</div>
              <div style={{ fontSize: 12, opacity: 0.5 }}>구비드 공식 실시간 서비스 관제 모니터</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              opacity: 0.6,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* 바디 영역 */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* 좌측 사이드바 탭 메뉴 */}
          <div
            style={{
              width: 220,
              borderRight: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(0, 0, 0, 0.15)",
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {[
              { id: "dashboard", label: "실시간 대시보드", icon: "target" as const },
              { id: "users", label: "가입자 관리", icon: "shield" as const },
              { id: "qna", label: "Q&A 문의 제어", icon: "info" as const },
              { id: "system", label: "시스템 제어판", icon: "settings" as const },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  fetchAllData();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: activeTab === tab.id ? "rgba(91, 140, 122, 0.2)" : "transparent",
                  color: activeTab === tab.id ? "#5b8c7a" : "#ccc",
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  fontSize: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.color = "#fff";
                  }
                }}
                onMouseLeave={e => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#ccc";
                  }
                }}
              >
                <Icon name={tab.icon} size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* 우측 메인 콘텐츠 */}
          <div style={{ flex: 1, padding: 32, overflowY: "auto", background: "rgba(18, 18, 18, 0.2)" }}>
            {loading ? (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>데이터 관제 데이터 수집 중...</div>
                </div>
              </div>
            ) : (
              <>
                {/* 1. 대시보드 탭 */}
                {activeTab === "dashboard" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {/* 통계 요약 카드 */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                      {[
                        { title: "총 가입자 수", val: `${profiles.length}명`, sub: "누적 가입 회원", color: "#5b8c7a" },
                        { title: "유료 구독자 수", val: `${subscriptions.filter(s => s.plan_id !== "free" && s.status === "active").length}명`, sub: "Pro / Premium 실유저", color: "#d9a752" },
                        { title: "최근 동기화 로그 수", val: `${events.length}건`, sub: "서버 수집 posture_events", color: "#c95c5c" },
                        { title: "통계 데이터 적재일", val: `${dailyScores.length}일`, sub: "일일 평균 점수 테이블 기록", color: "#5c8fc9" },
                      ].map((card, i) => (
                        <div
                          key={i}
                          style={{
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.05)",
                            borderRadius: 16,
                            padding: "20px 24px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div style={{ fontSize: 13, opacity: 0.6 }}>{card.title}</div>
                          <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.val}</div>
                          <div style={{ fontSize: 11, opacity: 0.4 }}>{card.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* 차트 시각화 패널 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
                      {/* 차트 1: 시간대별 이용량 바 차트 */}
                      <div
                        style={{
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 16,
                          padding: 24,
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5b8c7a" }}></span>
                          시간대별 활성 모니터링 이벤트 분포 (24시간)
                        </div>
                        {totalViolations === 0 ? (
                          <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4, fontSize: 12 }}>
                            수집된 사용 분석 데이터가 존재하지 않습니다.
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-end", height: 160, gap: 4, paddingBottom: 16 }}>
                            {hourCounts.map((val, hour) => {
                              const maxVal = Math.max(...hourCounts, 1);
                              const heightPct = (val / maxVal) * 100;
                              return (
                                <div
                                  key={hour}
                                  style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 6,
                                    height: "100%",
                                    justifyContent: "flex-end",
                                  }}
                                  title={`${hour}시: ${val}건`}
                                >
                                  <div
                                    style={{
                                      width: "100%",
                                      height: `${Math.max(4, heightPct)}%`,
                                      background: val > 0 ? "linear-gradient(to top, #3c5e52, #5b8c7a)" : "rgba(255,255,255,0.05)",
                                      borderRadius: "3px 3px 0 0",
                                      transition: "all 0.3s",
                                    }}
                                  ></div>
                                  <span style={{ fontSize: 9, opacity: 0.4, transform: "scale(0.8)" }}>{hour}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* 차트 2: 위반 유형 분포 도넛형 SVG 차트 */}
                      <div
                        style={{
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 16,
                          padding: 24,
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#c95c5c" }}></span>
                          경고 위반 유형별 비중
                        </div>
                        {totalViolations === 0 ? (
                          <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4, fontSize: 12 }}>
                            데이터 없음
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                            {/* SVG 도넛 형태 */}
                            <svg width="120" height="120" viewBox="0 0 42 42" className="donut">
                              <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4.2"></circle>
                              {(() => {
                                let accumulatedPercentage = 0;
                                return postureTypes.map((type, idx) => {
                                  const count = typeCounts[type];
                                  const pct = (count / totalViolations) * 100;
                                  const strokeDasharray = `${pct} ${100 - pct}`;
                                  const strokeDashoffset = 100 - accumulatedPercentage + 25;
                                  accumulatedPercentage += pct;

                                  const colors = ["#5b8c7a", "#c95c5c", "#d9a752", "#5c8fc9", "#a85cc9"];
                                  const color = colors[idx % colors.length];

                                  return (
                                    <circle
                                      key={type}
                                      cx="21"
                                      cy="21"
                                      r="15.91549430918954"
                                      fill="transparent"
                                      stroke={color}
                                      strokeWidth="4.2"
                                      strokeDasharray={strokeDasharray}
                                      strokeDashoffset={strokeDashoffset}
                                    ></circle>
                                  );
                                });
                              })()}
                            </svg>

                            {/* 레이블 설명 */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                              {postureTypes.slice(0, 4).map((type, idx) => {
                                const count = typeCounts[type];
                                const pct = Math.round((count / totalViolations) * 100);
                                const colors = ["#5b8c7a", "#c95c5c", "#d9a752", "#5c8fc9", "#a85cc9"];
                                const color = colors[idx % colors.length];
                                
                                const typeLabels: Record<string, string> = {
                                  forward_head: "거북목",
                                  shoulder_tilt: "어깨 기울임",
                                  slouching: "등 구부정",
                                  chin_resting: "턱 굄",
                                  monitor_too_close: "거리 근접",
                                };

                                return (
                                  <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, gap: 6 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }}></span>
                                    <span style={{ flex: 1, opacity: 0.7 }}>{typeLabels[type] || type}</span>
                                    <span style={{ fontWeight: 700 }}>{pct}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. 가입자 관리 탭 */}
                {activeTab === "users" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>전체 가입자 상세 관리</div>
                    
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        background: "rgba(255, 255, 255, 0.01)",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 13, textAlign: "left" }}>
                          <th style={{ padding: 16 }}>사용자 정보</th>
                          <th style={{ padding: 16 }}>등급(플랜)</th>
                          <th style={{ padding: 16 }}>구독 상태</th>
                          <th style={{ padding: 16 }}>가입 일시</th>
                          <th style={{ padding: 16 }}>등급 변경 조작</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map(user => {
                          const sub = subscriptions.find(s => s.user_id === user.id) || { plan_id: "free", status: "active" };
                          return (
                            <tr key={user.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", fontSize: 13 }}>
                              <td style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ fontSize: 20 }}>{user.avatar || "😊"}</div>
                                <div>
                                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                                    {user.name || "사용자"}
                                    {user.is_admin && (
                                      <span style={{ fontSize: 10, background: "rgba(91, 140, 122, 0.3)", color: "#5b8c7a", padding: "1px 5px", borderRadius: 4 }}>
                                        어드민
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, opacity: 0.4 }}>{user.id}</div>
                                </div>
                              </td>
                              <td style={{ padding: 16 }}>
                                <span
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: sub.plan_id === "pro" ? "rgba(91, 140, 122, 0.15)" : sub.plan_id === "premium" ? "rgba(217, 167, 82, 0.15)" : "rgba(255,255,255,0.06)",
                                    color: sub.plan_id === "pro" ? "#5b8c7a" : sub.plan_id === "premium" ? "#d9a752" : "#ccc",
                                  }}
                                >
                                  {sub.plan_id.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: 16 }}>
                                <span style={{ color: sub.status === "active" ? "#5b8c7a" : "#c95c5c" }}>
                                  ● {sub.status === "active" ? "활성" : "비활성"}
                                </span>
                              </td>
                              <td style={{ padding: 16, opacity: 0.6 }}>
                                {new Date(user.created_at).toLocaleDateString()}
                              </td>
                              <td style={{ padding: 16 }}>
                                <select
                                  defaultValue={`${sub.plan_id}-${sub.status}`}
                                  onChange={e => {
                                    const [p, s] = e.target.value.split("-");
                                    handleUpdatePlan(user.id, p, s);
                                  }}
                                  style={{
                                    background: "#222",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    color: "#fff",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontSize: 12,
                                    cursor: "pointer",
                                  }}
                                >
                                  <option value="free-active">FREE (활성)</option>
                                  <option value="pro-active">PRO (활성)</option>
                                  <option value="premium-active">PREMIUM (활성)</option>
                                  <option value="free-inactive">FREE (정지)</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. Q&A 문의 제어 탭 */}
                {activeTab === "qna" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24, height: "60vh" }}>
                    {/* 질문 목록 */}
                    <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>최신 Q&A 문의 목록</div>
                      {posts.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, opacity: 0.4, fontSize: 13 }}>
                          등록된 유저 질문글이 없습니다.
                        </div>
                      ) : (
                        posts.map(post => (
                          <div
                            key={post.id}
                            onClick={() => setSelectedPost(post)}
                            style={{
                              background: selectedPost?.id === post.id ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.01)",
                              border: selectedPost?.id === post.id ? "1px solid #5b8c7a" : "1px solid rgba(255,255,255,0.05)",
                              borderRadius: 12,
                              padding: 16,
                              cursor: "pointer",
                              transition: "all 0.2s",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, flex: 1, color: "#fff" }}>{post.title}</div>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleDeletePost(post.id);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#c95c5c",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                삭제
                              </button>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {post.content}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.4, marginTop: 4 }}>
                              <span>{new Date(post.created_at).toLocaleDateString()}</span>
                              <span>👍 {post.likes} · 👀 {post.views}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* 질문 상세 및 댓글(답변) 등록 */}
                    <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
                      {selectedPost ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
                          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{selectedPost.title}</div>
                            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{selectedPost.content}</div>
                            <div style={{ fontSize: 11, opacity: 0.4, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                              글 고유 ID: {selectedPost.id}
                            </div>
                          </div>

                          {/* 댓글 목록 */}
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 6 }}>
                              답변 및 피드백 댓글 ({comments.filter(c => c.post_id === selectedPost.id).length})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {comments.filter(c => c.post_id === selectedPost.id).map(comment => {
                                const commentUser = profiles.find(p => p.id === comment.user_id) || { name: "댓글 사용자", is_admin: false };
                                return (
                                  <div
                                    key={comment.id}
                                    style={{
                                      background: "rgba(255,255,255,0.01)",
                                      border: "1px solid rgba(255,255,255,0.04)",
                                      borderRadius: 10,
                                      padding: "12px 16px",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 4,
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                      <span style={{ fontWeight: 700, color: commentUser.is_admin ? "#5b8c7a" : "#ccc" }}>
                                        {commentUser.name} {commentUser.is_admin && "(관리자)"}
                                      </span>
                                      <div style={{ display: "flex", gap: 10, opacity: 0.4 }}>
                                        <span>{new Date(comment.created_at).toLocaleTimeString()}</span>
                                        <button
                                          onClick={() => handleDeleteComment(comment.id)}
                                          style={{ background: "none", border: "none", color: "#c95c5c", fontSize: 10, cursor: "pointer" }}
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{comment.content}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 답변 작성 폼 */}
                          <form onSubmit={handleAddComment} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16, display: "flex", gap: 10 }}>
                            <input
                              type="text"
                              placeholder="어드민 공식 답변을 즉석에서 달아보세요..."
                              value={newCommentText}
                              onChange={e => setNewCommentText(e.target.value)}
                              style={{
                                flex: 1,
                                background: "#111",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 10,
                                padding: "10px 16px",
                                color: "#fff",
                                fontSize: 12,
                              }}
                            />
                            <button
                              type="submit"
                              style={{
                                background: "#5b8c7a",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "0 20px",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              답변 등록
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 13 }}>
                          좌측 목록에서 질문 게시글을 선택해 피드백 답변을 달아주세요.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. 시스템 제어판 탭 */}
                {activeTab === "system" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    {/* 데이터 청소기 */}
                    <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#d9a752" }}>⚠</span>
                        90일 만료 데이터베이스 정리 (Clean)
                      </div>
                      <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.6 }}>
                        국내 개인정보보호법에 의거, 90일이 초과한 유저의 원시 자세 분석 로그(`posture_events`)를 완벽히 영구 삭제합니다.
                        일일 평균 통계인 `daily_scores`는 보존되므로 사용자 사용성에는 문제가 없습니다.
                      </p>
                      
                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <button
                          onClick={() => handlePurgeData(true)}
                          disabled={isCleaning}
                          style={{
                            flex: 1,
                            background: "rgba(255,255,255,0.06)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 16px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          모의 실행 (--dry-run)
                        </button>
                        <button
                          onClick={() => handlePurgeData(false)}
                          disabled={isCleaning}
                          style={{
                            flex: 1,
                            background: "#c95c5c",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 16px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {isCleaning ? "정리 중..." : "실제 영구 삭제"}
                        </button>
                      </div>
                    </div>

                    {/* QA 테스트 데이터 주입 */}
                    <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#5b8c7a" }}>🧪</span>
                        QA 품질 검증용 데이터 주입 (Mock Data)
                      </div>
                      <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.6 }}>
                        테스트를 위해 가상의 거북목 자세 위반 로그 20건, 7일치 일평균 통계 및 Q&A 모의 글 2건을 즉석에서 주입합니다.
                        어드민 대시보드 차트 시각화 및 Q&A 조작 정상 작동 여부를 빠르게 QA 검증할 수 있습니다.
                      </p>
                      
                      <button
                        onClick={handleInjectMockData}
                        disabled={isGeneratingMock}
                        style={{
                          background: "#5b8c7a",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "10px 16px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          marginTop: 10,
                        }}
                      >
                        {isGeneratingMock ? "주입 중..." : "QA 테스트 데이터 생성 및 주입"}
                      </button>
                    </div>

                    {/* 콘솔 출력 로그 */}
                    <div style={{ gridColumn: "span 2", background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.4, marginBottom: 10, fontFamily: "monospace" }}>SYSTEM CONSOLE OUTPUT</div>
                      <div
                        style={{
                          height: 120,
                          overflowY: "auto",
                          fontFamily: "monospace",
                          fontSize: 11,
                          color: "#39ff14", // 녹색 형광 폰트
                          lineHeight: 1.6,
                        }}
                      >
                        {cleanLog.length === 0 ? (
                          <span style={{ opacity: 0.3 }}>대기 중... 작업을 실행하면 로그가 표시됩니다.</span>
                        ) : (
                          cleanLog.map((log, idx) => <div key={idx}>{log}</div>)
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
