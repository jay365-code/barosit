import { useEffect, useState } from "react";
import { supabase } from "../auth/supabase";
import { Icon } from "../components/Icon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AdminTemplateView } from "./AdminTemplateView";

interface UserProfileData {
  id: string;
  name: string;
  avatar: string;
  work_env: string;
  is_admin: boolean;
  created_at: string;
  email?: string;
}

interface AdminNotificationData {
  id: string;
  event_type: string; // 'signup', 'cancellation', 'refund_requested', 'payment_failed', 'tampering_detected', 'system_error'
  severity: string; // 'info', 'warning', 'critical'
  message: string;
  payload: any;
  created_at: string;
  read_at: string | null;
}

interface ToastItem {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  created_at: string;
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

interface ReleaseData {
  id: string;
  version: string;
  released_at: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

interface Props {
  onClose: () => void;
}

export function AdminDashboardView({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "qna" | "system" | "alerts" | "releases" | "stretches">("dashboard");
  const [loading, setLoading] = useState(true);
  
  // 릴리즈 관리 상태
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<ReleaseData | null>(null);
  const [releaseVersion, setReleaseVersion] = useState("");
  const [releaseReleasedAt, setReleaseReleasedAt] = useState("");
  const [releaseContent, setReleaseContent] = useState("");
  const [savingRelease, setSavingRelease] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  
  // 데이터 상태
  const [profiles, setProfiles] = useState<UserProfileData[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [events, setEvents] = useState<PostureEventData[]>([]);
  const [dailyScores, setDailyScores] = useState<DailyScoreData[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [notifications, setNotifications] = useState<AdminNotificationData[]>([]);
  
  // 실시간 토스트 상태
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // 알림 필터 상태
  const [severityFilter, setSeverityFilter] = useState<"all" | "info" | "warning" | "critical">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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

      // 7. 실시간 어드민 알림 조회 (최신 100건 제한)
      const { data: notifData } = await supabase.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(100);

      // 8. 릴리즈 정보 조회 (최신 정보 순 정렬)
      let relData: any[] = [];
      try {
        const { data } = await supabase.from("releases").select("*").order("released_at", { ascending: false });
        relData = data || [];
      } catch (err) {
        console.warn("Failed to fetch releases. releases table might not exist yet.", err);
      }

      setProfiles(profData || []);
      setSubscriptions(subData || []);
      setEvents(evtData || []);
      setDailyScores(scoreData || []);
      setPosts(postData || []);
      setComments(commentData || []);
      setNotifications(notifData || []);
      setReleases(relData);
    } catch (err) {
      console.error("[AdminDashboard] Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Web Audio API를 활용한 효과음 실시간 합성 재생 헬퍼
  const playNotificationSound = (severity: string) => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      
      const playTone = (freq: number, type: OscillatorType, duration: number, delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        
        gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };

      if (severity === "critical") {
        // 날카롭고 강렬한 3-Tone 사이렌 (보안 우회 등)
        playTone(880.00, "sawtooth", 0.15, 0.0);
        playTone(987.77, "sawtooth", 0.15, 0.15);
        playTone(1046.50, "sawtooth", 0.35, 0.30);
      } else if (severity === "warning") {
        // 긴장감을 제공하는 2-Tone 마이너 비프음 (결제 실패 등)
        playTone(440.00, "triangle", 0.12, 0.0);
        playTone(349.23, "triangle", 0.25, 0.12);
      } else {
        // 맑고 부드러운 2-Tone 비프음 (가입, 일반 정보)
        playTone(523.25, "sine", 0.10, 0.0);
        playTone(659.25, "sine", 0.20, 0.08);
      }
    } catch (err) {
      console.warn("[AdminDashboard] Web Audio API blocked or failed:", err);
    }
  };

  useEffect(() => {
    fetchAllData();

    // Supabase Realtime 채널을 이용한 실시간 알림 테이블 INSERT 구독
    const channel = supabase
      .channel("admin_notifications_realtime_dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const newNotif = payload.new as AdminNotificationData;
          
          // 1. 목록 상태 최상단에 리액티브 적재
          setNotifications(prev => [newNotif, ...prev]);
          
          // 2. 위험도별 Web Audio 효과음 즉각 재생
          playNotificationSound(newNotif.severity);
          
          // 3. 실시간 토스트 팝업 스택에 삽입
          const toastId = newNotif.id || Math.random().toString();
          setToasts(prev => [...prev, {
            id: toastId,
            event_type: newNotif.event_type,
            severity: newNotif.severity,
            message: newNotif.message,
            created_at: newNotif.created_at
          }]);
          
          // 4.5초 뒤 토스트 팝업 자동 디스미스 소멸
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== toastId));
          }, 4500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 알림 개별 읽음 처리 핸들러
  const handleMarkAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      
      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch (err: any) {
      alert("알림 읽음 처리 실패: " + err.message);
    }
  };

  // 알림 일괄 읽음 처리 핸들러
  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;
    try {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
      
      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => (unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch (err: any) {
      alert("알림 일괄 읽음 처리 실패: " + err.message);
    }
  };

  // 알림 개별 삭제 핸들러
  const handleDeleteNotification = async (id: string) => {
    if (!confirm("이 알림 기록을 영구 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("admin_notifications").delete().eq("id", id);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      alert("알림 삭제 실패: " + err.message);
    }
  };

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

  // 4-2. 릴리즈 노트 관리 핸들러 및 헬퍼
  const getLocalDateTimeString = (d: Date = new Date()) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseVersion.trim() || !releaseContent.trim()) {
      setReleaseError("버전명과 마크다운 내용을 입력해주세요.");
      return;
    }

    setSavingRelease(true);
    setReleaseError(null);
    try {
      const payload = {
        version: releaseVersion.trim(),
        released_at: releaseReleasedAt ? new Date(releaseReleasedAt).toISOString() : new Date().toISOString(),
        content: releaseContent,
        updated_at: new Date().toISOString()
      };

      let res;
      if (selectedRelease) {
        // UPDATE
        res = await supabase
          .from("releases")
          .update(payload)
          .eq("id", selectedRelease.id);
      } else {
        // INSERT
        res = await supabase
          .from("releases")
          .insert([payload]);
      }

      if (res.error) throw res.error;

      // 성공! 릴리즈 데이터를 다시 불러온 후 폼을 초기화합니다.
      await fetchAllData();
      handleResetForm();
    } catch (err: any) {
      console.error("Failed to save release:", err);
      setReleaseError(`저장에 실패했습니다: ${err.message || err.details || JSON.stringify(err)}`);
    } finally {
      setSavingRelease(false);
    }
  };

  const handleDeleteRelease = async (id: string) => {
    if (!window.confirm("정말로 이 업데이트 내역을 영구히 삭제하시겠습니까?")) return;

    setSavingRelease(true);
    try {
      const { error } = await supabase
        .from("releases")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await fetchAllData();
      if (selectedRelease?.id === id) {
        handleResetForm();
      }
    } catch (err: any) {
      console.error("Failed to delete release:", err);
      setReleaseError(`삭제에 실패했습니다: ${err.message || err.details || JSON.stringify(err)}`);
    } finally {
      setSavingRelease(false);
    }
  };

  const handleSelectRelease = (rel: ReleaseData) => {
    setSelectedRelease(rel);
    setReleaseVersion(rel.version);
    setReleaseReleasedAt(getLocalDateTimeString(new Date(rel.released_at)));
    setReleaseContent(rel.content);
    setReleaseError(null);
  };

  const handleResetForm = () => {
    setSelectedRelease(null);
    setReleaseVersion("");
    setReleaseReleasedAt(getLocalDateTimeString());
    setReleaseContent("");
    setReleaseError(null);
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
        width: "100vw",
        height: "100vh",
        background: "rgba(16, 18, 22, 0.99)",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
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
              { id: "alerts", label: "실시간 알림", icon: "bell" as const },
              { id: "releases", label: "업데이트/공지 관리", icon: "sparkle" as const },
              { id: "stretches", label: "스트레칭 템플릿 제어", icon: "target" as const },
              { id: "system", label: "시스템 제어판", icon: "settings" as const },
            ].map(tab => {
              const isAlerts = tab.id === "alerts";
              const unreadCount = notifications.filter(n => !n.read_at).length;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    fetchAllData();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                    width: "100%",
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
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Icon name={tab.icon} size={16} />
                    <span>{tab.label}</span>
                  </div>
                  {isAlerts && unreadCount > 0 && (
                    <span
                      style={{
                        background: "#c95c5c",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 10,
                        minWidth: 16,
                        textAlign: "center",
                        lineHeight: 1,
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
            
            <div style={{ height: "1px", background: "rgba(255, 255, 255, 0.08)", margin: "12px 0" }} />
            <button
              onClick={() => {
                window.location.hash = "#/qa";
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "rgba(255, 199, 61, 0.06)",
                color: "#ffc73d",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s",
                width: "100%",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255, 199, 61, 0.12)";
                e.currentTarget.style.color = "#ffe082";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255, 199, 61, 0.06)";
                e.currentTarget.style.color = "#ffc73d";
              }}
            >
              <Icon name="sparkle" size={16} />
              <span>QA 체크리스트 이동</span>
            </button>
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
                {/* 5. 실시간 알림 탭 */}
                {activeTab === "alerts" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* 상단 제어 바 */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: 14,
                        padding: "16px 24px",
                      }}
                    >
                      {/* 필터 그룹 */}
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, opacity: 0.5 }}>위험도:</span>
                          <select
                            value={severityFilter}
                            onChange={e => setSeverityFilter(e.target.value as any)}
                            style={{
                              background: "#222",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#fff",
                              borderRadius: 8,
                              padding: "6px 12px",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            <option value="all">전체 (All)</option>
                            <option value="info">정보 (Info)</option>
                            <option value="warning">경고 (Warning)</option>
                            <option value="critical">심각 (Critical)</option>
                          </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, opacity: 0.5 }}>이벤트 종류:</span>
                          <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value)}
                            style={{
                              background: "#222",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#fff",
                              borderRadius: 8,
                              padding: "6px 12px",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            <option value="all">전체 종류</option>
                            <option value="signup">회원 가입 (signup)</option>
                            <option value="cancellation">구독 해지 (cancellation)</option>
                            <option value="refund_requested">환불 요청 (refund)</option>
                            <option value="payment_failed">결제 실패 (failed)</option>
                            <option value="tampering_detected">보안 변조 감지 (tampering)</option>
                            <option value="system_error">장애/시스템 오류 (error)</option>
                          </select>
                        </div>
                      </div>

                      {/* 모두 읽음 버튼 */}
                      <button
                        onClick={handleMarkAllAsRead}
                        disabled={notifications.filter(n => !n.read_at).length === 0}
                        style={{
                          background: "rgba(91, 140, 122, 0.15)",
                          color: "#5b8c7a",
                          border: "1px solid rgba(91, 140, 122, 0.3)",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          opacity: notifications.filter(n => !n.read_at).length === 0 ? 0.5 : 1,
                        }}
                        onMouseEnter={e => {
                          if (notifications.filter(n => !n.read_at).length > 0) {
                            e.currentTarget.style.background = "#5b8c7a";
                            e.currentTarget.style.color = "#fff";
                          }
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "rgba(91, 140, 122, 0.15)";
                          e.currentTarget.style.color = "#5b8c7a";
                        }}
                      >
                        ✓ 미확인 알림 모두 읽음
                      </button>
                    </div>

                    {/* 알림 피드 리스트 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "50vh", overflowY: "auto", paddingRight: 6 }}>
                      {(() => {
                        const filtered = notifications.filter(n => {
                          const matchesSev = severityFilter === "all" || n.severity === severityFilter;
                          const matchesType = typeFilter === "all" || n.event_type === typeFilter;
                          return matchesSev && matchesType;
                        });

                        if (filtered.length === 0) {
                          return (
                            <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.4, fontSize: 13 }}>
                              해당 조건에 만족하는 알림 내역이 없습니다.
                            </div>
                          );
                        }

                        return filtered.map(notif => {
                          const isRead = !!notif.read_at;
                          
                          // 중요도별 프리미엄 스타일링 HSL Harmonies
                          const styleConfig = {
                            critical: {
                              border: "rgba(201, 92, 92, 0.3)",
                              borderHover: "rgba(201, 92, 92, 0.7)",
                              bg: "rgba(201, 92, 92, 0.03)",
                              bgHover: "rgba(201, 92, 92, 0.06)",
                              accent: "#c95c5c",
                              label: "위험(Critical)",
                              icon: "lock" as const,
                            },
                            warning: {
                              border: "rgba(217, 167, 82, 0.3)",
                              borderHover: "rgba(217, 167, 82, 0.7)",
                              bg: "rgba(217, 167, 82, 0.03)",
                              bgHover: "rgba(217, 167, 82, 0.06)",
                              accent: "#d9a752",
                              label: "경고(Warning)",
                              icon: "info" as const,
                            },
                            info: {
                              border: "rgba(91, 140, 122, 0.3)",
                              borderHover: "rgba(91, 140, 122, 0.7)",
                              bg: "rgba(91, 140, 122, 0.03)",
                              bgHover: "rgba(91, 140, 122, 0.06)",
                              accent: "#5b8c7a",
                              label: "정보(Info)",
                              icon: "bell" as const,
                            }
                          }[notif.severity as "critical"|"warning"|"info"] || {
                            border: "rgba(255, 255, 255, 0.1)",
                            borderHover: "rgba(255, 255, 255, 0.3)",
                            bg: "transparent",
                            bgHover: "rgba(255, 255, 255, 0.02)",
                            accent: "#ccc",
                            label: "알림",
                            icon: "info" as const,
                          };

                          return (
                            <div
                              key={notif.id}
                              style={{
                                background: isRead ? "rgba(255, 255, 255, 0.01)" : styleConfig.bg,
                                border: `1px solid ${isRead ? "rgba(255, 255, 255, 0.05)" : styleConfig.border}`,
                                borderRadius: 14,
                                padding: "16px 20px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 16,
                                opacity: isRead ? 0.6 : 1,
                                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                                cursor: "default",
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.border = `1px solid ${isRead ? "rgba(255, 255, 255, 0.15)" : styleConfig.borderHover}`;
                                e.currentTarget.style.background = isRead ? "rgba(255, 255, 255, 0.02)" : styleConfig.bgHover;
                                e.currentTarget.style.transform = "translateY(-1px)";
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.border = `1px solid ${isRead ? "rgba(255, 255, 255, 0.05)" : styleConfig.border}`;
                                e.currentTarget.style.background = isRead ? "rgba(255, 255, 255, 0.01)" : styleConfig.bg;
                                e.currentTarget.style.transform = "none";
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                                {/* 중요도 라벨 및 아이콘 */}
                                <div
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 10,
                                    background: isRead ? "rgba(255, 255, 255, 0.03)" : `rgba(${notif.severity === "critical" ? "201, 92, 92" : notif.severity === "warning" ? "217, 167, 82" : "91, 140, 122"}, 0.15)`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: isRead ? "#888" : styleConfig.accent,
                                  }}
                                >
                                  <Icon name={styleConfig.icon} size={18} />
                                </div>

                                {/* 내용 및 시간 */}
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: isRead ? "rgba(255,255,255,0.06)" : `rgba(${notif.severity === "critical" ? "201, 92, 92" : notif.severity === "warning" ? "217, 167, 82" : "91, 140, 122"}, 0.1)`, color: isRead ? "#888" : styleConfig.accent, border: `1px solid ${isRead ? "rgba(255,255,255,0.1)" : styleConfig.border}` }}>
                                      {styleConfig.label}
                                    </span>
                                    <span style={{ fontSize: 11, opacity: 0.4 }}>
                                      {new Date(notif.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 6, lineHeight: 1.4 }}>
                                    {notif.message}
                                  </div>
                                </div>
                              </div>

                              {/* 액션 제어 그룹 */}
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                {!isRead && (
                                  <button
                                    onClick={() => handleMarkAsRead(notif.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: "#5b8c7a",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      padding: "4px 8px",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                                    onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                                  >
                                    읽음 처리
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteNotification(notif.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "rgba(201, 92, 92, 0.7)",
                                    cursor: "pointer",
                                    padding: 4,
                                    borderRadius: 6,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "background 0.2s",
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.background = "rgba(201, 92, 92, 0.1)";
                                    e.currentTarget.style.color = "#c95c5c";
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.background = "none";
                                    e.currentTarget.style.color = "rgba(201, 92, 92, 0.7)";
                                  }}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

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

                {/* 5. 업데이트 및 공지사항 관리자 화면 UI */}
                {activeTab === "releases" && (
                  <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, height: "calc(100vh - 200px)", overflow: "hidden" }}>
                    {/* 좌측 릴리즈 목록 */}
                    <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>릴리즈 목록</div>
                        <button
                          onClick={handleResetForm}
                          style={{
                            background: "#5b8c7a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Icon name="plus" size={14} />
                          신규 작성
                        </button>
                      </div>

                      {releases.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 0", opacity: 0.4, fontSize: 13 }}>
                          등록된 업데이트 내역이 없습니다.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {releases.map(rel => (
                            <div
                              key={rel.id}
                              onClick={() => handleSelectRelease(rel)}
                              style={{
                                background: selectedRelease?.id === rel.id ? "rgba(91, 140, 122, 0.15)" : "rgba(255, 255, 255, 0.02)",
                                border: selectedRelease?.id === rel.id ? "1px solid #5b8c7a" : "1px solid rgba(255, 255, 255, 0.05)",
                                borderRadius: 10,
                                padding: "12px 14px",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ background: "#5b8c7a", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                                  {rel.version}
                                </span>
                                <span style={{ fontSize: 11, opacity: 0.4 }}>
                                  {new Date(rel.released_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {rel.content.substring(0, 50)}...
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 우측 편집 폼 & 라이브 프리뷰 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", paddingRight: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>
                          {selectedRelease ? "릴리즈 노트 편집" : "새로운 릴리즈 등록"}
                        </div>
                        {selectedRelease && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRelease(selectedRelease.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#c95c5c",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Icon name="trash" size={14} />
                            이 릴리즈 삭제하기
                          </button>
                        )}
                      </div>

                      {releaseError && (
                        <div style={{ background: "rgba(201, 92, 92, 0.1)", border: "1px solid #c95c5c", borderRadius: 8, padding: "12px 16px", color: "#c95c5c", fontSize: 13 }}>
                          {releaseError}
                        </div>
                      )}

                      <form onSubmit={handleSaveRelease} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>버전명 *</label>
                            <input
                              type="text"
                              value={releaseVersion}
                              onChange={e => setReleaseVersion(e.target.value)}
                              placeholder="예: v1.0.0"
                              required
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: 8,
                                padding: "10px 14px",
                                color: "#fff",
                                fontSize: 13,
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>출시 일시 (Released At)</label>
                            <input
                              type="datetime-local"
                              value={releaseReleasedAt}
                              onChange={e => setReleaseReleasedAt(e.target.value)}
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: 8,
                                padding: "10px 14px",
                                color: "#fff",
                                fontSize: 13,
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>릴리즈 노트 내용 (마크다운 지원) *</label>
                          <textarea
                            value={releaseContent}
                            onChange={e => setReleaseContent(e.target.value)}
                            placeholder="이번 릴리즈의 변경 사항을 마크다운 형식으로 작성해주세요.&#10;예:&#10;### 주요 변경 사항&#10;- 거북목 감지 성능 향상&#10;- 어드민 제어판 추가"
                            required
                            rows={12}
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: 8,
                              padding: "12px 16px",
                              color: "#fff",
                              fontSize: 13,
                              fontFamily: "monospace",
                              lineHeight: 1.6,
                              resize: "vertical",
                            }}
                          />
                        </div>

                        {/* 라이브 프리뷰 */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>실시간 프리뷰 (Live Preview)</label>
                          <div
                            style={{
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.05)",
                              borderRadius: 8,
                              padding: "20px 24px",
                              minHeight: 150,
                              color: "#ccc",
                              fontSize: 13,
                              lineHeight: 1.6,
                            }}
                          >
                            {releaseContent.trim() ? (
                              <div className="b-legal-body" style={{ color: "rgba(255,255,255,0.85)" }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {releaseContent}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <span style={{ opacity: 0.3, fontStyle: "italic" }}>내용을 입력하면 여기에 실시간 렌더링 결과가 표시됩니다.</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 10 }}>
                          {selectedRelease && (
                            <button
                              type="button"
                              onClick={handleResetForm}
                              style={{
                                background: "rgba(255,255,255,0.06)",
                                color: "#ccc",
                                border: "none",
                                borderRadius: 8,
                                padding: "10px 20px",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              취소
                            </button>
                          )}
                          <button
                            type="submit"
                            disabled={savingRelease}
                            style={{
                              background: "#5b8c7a",
                              color: "#fff",
                              border: "none",
                              borderRadius: 8,
                              padding: "10px 24px",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {savingRelease ? "저장 중..." : selectedRelease ? "수정사항 저장" : "새 릴리즈 등록"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* 7. 스트레칭 템플릿 관리 탭 */}
                {activeTab === "stretches" && (
                  <AdminTemplateView />
                )}
              </>
            )}
          </div>
        </div>

        {/* 실시간 알림 토스트 스택 (Top Layer 포지셔닝) */}
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxWidth: 360,
            width: "100%",
            pointerEvents: "none",
          }}
        >
          {toasts.map(toast => {
            const colors = {
              critical: { border: "rgba(201, 92, 92, 0.8)", bg: "rgba(20, 10, 10, 0.95)", glow: "0 0 15px rgba(201, 92, 92, 0.4)", accent: "#c95c5c" },
              warning: { border: "rgba(217, 167, 82, 0.8)", bg: "rgba(20, 18, 10, 0.95)", glow: "0 0 10px rgba(217, 167, 82, 0.2)", accent: "#d9a752" },
              info: { border: "rgba(91, 140, 122, 0.8)", bg: "rgba(10, 20, 15, 0.95)", glow: "0 0 10px rgba(91, 140, 122, 0.2)", accent: "#5b8c7a" },
            }[toast.severity as "critical"|"warning"|"info"] || { border: "rgba(255,255,255,0.2)", bg: "rgba(20,20,20,0.95)", glow: "none", accent: "#ccc" };

            const severityLabel = {
              critical: "🚨 CRITICAL WARNING",
              warning: "⚠️ WARNING",
              info: "📢 NOTICE"
            }[toast.severity as "critical"|"warning"|"info"] || "ALERT";

            return (
              <div
                key={toast.id}
                style={{
                  pointerEvents: "auto",
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 14,
                  padding: "16px 20px",
                  boxShadow: `0 10px 30px rgba(0,0,0,0.5), ${colors.glow}`,
                  backdropFilter: "blur(12px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  color: "#fff",
                  fontFamily: "'Inter', sans-serif",
                  animation: "toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* 상단 라벨 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: colors.accent, letterSpacing: "0.5px" }}>
                    {severityLabel}
                  </span>
                  <button
                    onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#fff",
                      opacity: 0.5,
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "0.5"}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
                {/* 본문 */}
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, opacity: 0.95 }}>
                  {toast.message}
                </div>
                {/* 시간 정보 */}
                <div style={{ fontSize: 10, opacity: 0.35, textAlign: "right" }}>
                  {new Date(toast.created_at).toLocaleTimeString()}
                </div>
                
                {/* 토스트 진입 키프레임 스타일용 인라인 style 정의 */}
                <style>{`
                  @keyframes toastSlideIn {
                    from { transform: translateX(120%) scale(0.9); opacity: 0; }
                    to { transform: translateX(0) scale(1); opacity: 1; }
                  }
                `}</style>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
