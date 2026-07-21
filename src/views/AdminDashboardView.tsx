import { useEffect, useState } from "react";
import { supabase } from "../auth/supabase";
import { getLaunchMode, setLaunchModeRemote, isPreviewAsUser, setPreviewAsUser, type LaunchMode } from "../launchMode";
import { getMinSupportedVersion, setMinSupportedVersion } from "../updateGate";
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
  is_beta_tester?: boolean;
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

interface ClientErrorData {
  id: string;
  fingerprint: string;
  kind: string;
  severity: string;
  message: string;
  stack: string | null;
  route: string | null;
  app_version: string | null;
  client: string | null;
  user_agent: string | null;
  lang: string | null;
  plan: string | null;
  count: number;
  resolved: boolean;
  first_seen: string;
  last_seen: string;
}

interface UsageEventData {
  id: string;
  install_id: string;
  user_id: string | null;
  event: string;
  client: string | null;
  app_version: string | null;
  lang: string | null;
  props: any;
  created_at: string;
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

// 커뮤니티 에이전트(Aria/Ethan) AI 답변 초안 검수 레코드
interface AiDraftData {
  id: string;
  source_type: "post" | "comment" | "feedback";
  source_id: string | null;
  post_id: string | null;
  intent: string | null;
  agent_role: "coach" | "manager" | "pm" | null;
  feature_request_id?: string | null;
  category: string | null;
  should_respond: boolean;
  reason: string | null;
  language: string;
  confidence: number | null;
  risk_flags: string[];
  citations: { title: string; url?: string }[];
  draft_body: string;
  edited_body: string | null;
  status: "pending" | "approved" | "rejected" | "escalated";
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_comment_id: string | null;
  created_at: string;
}

interface ReleaseData {
  id: string;
  version: string;
  released_at: string;
  content: string;
  content_en?: string | null;
  created_at?: string;
  updated_at?: string;
}

// 기능 제안 클러스터(PM 에이전트 Ethan) — 공개 로드맵(#/roadmap)의 데이터
interface FeatureRequestData {
  id: string;
  title: string;
  status: "reviewing" | "planned" | "in_progress" | "done" | "declined";
  request_count: number;
  released_version: string | null;
  first_requested_at: string;
  updated_at: string;
}

const FEATURE_STATUS_LABELS: Record<FeatureRequestData["status"], string> = {
  reviewing: "검토중",
  planned: "예정",
  in_progress: "진행중",
  done: "완료",
  declined: "반려",
};

interface Props {
  onClose: () => void;
}

export function AdminDashboardView({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "qna" | "ai_review" | "roadmap" | "system" | "alerts" | "feedback" | "errors" | "usage" | "releases" | "stretches">("dashboard");
  const [loading, setLoading] = useState(true);
  const [launchMode, setLaunchModeState] = useState<LaunchMode>(getLaunchMode());
  const [previewAsUser, setPreviewAsUserState] = useState<boolean>(isPreviewAsUser());
  const [currentUser, setCurrentUser] = useState<{ email?: string; avatarUrl?: string; name?: string } | null>(null);
  
  // 릴리즈 관리 상태
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<ReleaseData | null>(null);
  const [releaseVersion, setReleaseVersion] = useState("");
  const [releaseReleasedAt, setReleaseReleasedAt] = useState("");
  const [releaseContent, setReleaseContent] = useState("");
  const [releaseContentEn, setReleaseContentEn] = useState("");
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
  const [clientErrors, setClientErrors] = useState<ClientErrorData[]>([]);
  const [showResolvedErrors, setShowResolvedErrors] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEventData[]>([]);

  // 실시간 토스트 상태
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // 알림 필터 상태
  const [severityFilter, setSeverityFilter] = useState<"all" | "info" | "warning" | "critical">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // 피드백 카테고리 필터 (전체/버그/제안/기타)
  const [feedbackCatFilter, setFeedbackCatFilter] = useState<"all" | "bug" | "idea" | "other">("all");

  // 강제 업데이트 게이트 상태 (app_config.min_supported_version)
  const [minVersion, setMinVersion] = useState<string | null>(null);
  const [minVersionInput, setMinVersionInput] = useState("");
  const [minVersionBusy, setMinVersionBusy] = useState(false);

  // 시스템 관리 상태
  const [cleanLog, setCleanLog] = useState<string[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isGeneratingMock, setIsGeneratingMock] = useState(false);
  // 관리자 강제 환불 폼 상태 (§11 M4-c)
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDowngrade, setRefundDowngrade] = useState(true);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundResult, setRefundResult] = useState<string | null>(null);

  // Q&A 특정 선택물 답변 상태
  const [selectedPost, setSelectedPost] = useState<PostData | null>(null);
  const [newCommentText, setNewCommentText] = useState("");

  // AI 응답 검수(Aria/Ethan) 상태
  const [drafts, setDrafts] = useState<AiDraftData[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<AiDraftData | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  // 기능 요청 로드맵(Ethan) 상태
  const [featureRequests, setFeatureRequests] = useState<FeatureRequestData[]>([]);
  const [frBusy, setFrBusy] = useState(false);

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

      // 7-1. 클라이언트 에러 리포트 조회 (최신 last_seen 순, 최대 200건)
      let errData: ClientErrorData[] = [];
      try {
        const { data } = await supabase
          .from("client_errors")
          .select("*")
          .order("last_seen", { ascending: false })
          .limit(200);
        errData = (data as ClientErrorData[]) || [];
      } catch (err) {
        console.warn("Failed to fetch client_errors. table might not exist yet.", err);
      }

      // 7-2. 사용 분석 이벤트 조회 (최근 2000건)
      let usageData: UsageEventData[] = [];
      try {
        const { data } = await supabase
          .from("usage_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000);
        usageData = (data as UsageEventData[]) || [];
      } catch (err) {
        console.warn("Failed to fetch usage_events. table might not exist yet.", err);
      }

      // 7-3. AI 답변 초안(Aria) 조회 — pending 우선, 최신순
      let draftData: AiDraftData[] = [];
      try {
        const { data } = await supabase
          .from("ai_response_drafts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        draftData = (data as AiDraftData[]) || [];
      } catch (err) {
        console.warn("Failed to fetch ai_response_drafts. table might not exist yet.", err);
      }

      // 8. 릴리즈 정보 조회 (최신 정보 순 정렬)
      let relData: any[] = [];
      try {
        const { data } = await supabase.from("releases").select("*").order("released_at", { ascending: false });
        relData = data || [];
      } catch (err) {
        console.warn("Failed to fetch releases. releases table might not exist yet.", err);
      }

      // 9. 기능 요청 클러스터(Ethan 로드맵) 조회
      let frData: FeatureRequestData[] = [];
      try {
        const { data } = await supabase
          .from("feature_requests")
          .select("*")
          .order("updated_at", { ascending: false });
        frData = (data as FeatureRequestData[]) || [];
      } catch (err) {
        console.warn("Failed to fetch feature_requests. table might not exist yet.", err);
      }
      setFeatureRequests(frData);

      setProfiles(profData || []);
      setSubscriptions(subData || []);
      setEvents(evtData || []);
      setDailyScores(scoreData || []);
      setPosts(postData || []);
      setComments(commentData || []);
      setNotifications(notifData || []);
      setClientErrors(errData);
      setUsageEvents(usageData);
      setDrafts(draftData);
      setReleases(relData);

      // 현재 로그인한 어드민 사용자 프로필 로드
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const myProfile = (profData || []).find((p: any) => p.id === session.user.id);
          setCurrentUser({
            email: session.user.email,
            avatarUrl: myProfile?.avatar || session.user.user_metadata?.avatar_url || session.user.user_metadata?.avatar,
            name: myProfile?.name || session.user.user_metadata?.name || session.user.user_metadata?.full_name || "어드민",
          });
        }
      } catch (err) {
        console.warn("[AdminDashboard] Failed to fetch current session user info:", err);
      }
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

  // 클라이언트 에러: 해결됨 토글
  const handleToggleErrorResolved = async (err: ClientErrorData) => {
    try {
      const next = !err.resolved;
      const { error } = await supabase
        .from("client_errors")
        .update({ resolved: next })
        .eq("id", err.id);
      if (error) throw error;
      setClientErrors(prev => prev.map(e => (e.id === err.id ? { ...e, resolved: next } : e)));
    } catch (e: any) {
      alert("에러 상태 변경 실패: " + e.message);
    }
  };

  // 클라이언트 에러: 삭제
  const handleDeleteError = async (id: string) => {
    try {
      const { error } = await supabase.from("client_errors").delete().eq("id", id);
      if (error) throw error;
      setClientErrors(prev => prev.filter(e => e.id !== id));
    } catch (e: any) {
      alert("에러 삭제 실패: " + e.message);
    }
  };

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
  const handleMarkAllAsRead = async (predicate?: (n: AdminNotificationData) => boolean) => {
    const unreadIds = notifications
      .filter(n => !n.read_at && (predicate ? predicate(n) : true))
      .map(n => n.id);
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

  // 4-1. AI 답변 초안(Aria) 검수 — 승인 시 Aria 이름으로 댓글 게시
  const handleApproveDraft = async (draft: AiDraftData) => {
    const body = (editingBody.trim() || draft.draft_body || "").trim();
    if (!draft.post_id || !body) {
      alert("게시할 본문이 비어있거나 대상 글이 없습니다.");
      return;
    }
    setReviewBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // 에이전트 자격으로 댓글 게시 (user_id=null, is_agent=true → 클라이언트가 운영자 뱃지 렌더)
      // 명의는 역할로 결정: pm=Ethan(프로덕트 매니저), coach/manager=Aria — docs/agent-roster.md
      const agentName = draft.agent_role === "pm" ? "Ethan" : "Aria";
      const { data: inserted, error: insErr } = await supabase
        .from("comments")
        .insert([{ post_id: draft.post_id, user_id: null, author_name: agentName, is_agent: true, agent_role: draft.agent_role ?? "coach", content: body, password_hash: "" }])
        .select();
      if (insErr) throw insErr;

      const publishedId = inserted?.[0]?.id ?? null;
      const { error: updErr } = await supabase
        .from("ai_response_drafts")
        .update({
          status: "approved",
          edited_body: body,
          reviewed_by: session?.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          published_comment_id: publishedId,
        })
        .eq("id", draft.id);
      if (updErr) throw updErr;

      setDrafts(prev => prev.map(d => (d.id === draft.id ? { ...d, status: "approved" } : d)));
      if (inserted) setComments(prev => [...prev, ...inserted]);
      setSelectedDraft(null);
      setEditingBody("");
    } catch (err: any) {
      alert("승인/게시 실패: " + err.message);
    } finally {
      setReviewBusy(false);
    }
  };

  const handleRejectDraft = async (draft: AiDraftData, escalate = false) => {
    setReviewBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("ai_response_drafts")
        .update({
          status: escalate ? "escalated" : "rejected",
          reviewed_by: session?.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      if (error) throw error;

      // 에스컬레이션 시 실시간 알림(admin_notifications)에 적재 → "실시간 알림" 탭에 노출
      if (escalate) {
        const srcPost = posts.find(p => p.id === draft.post_id);
        const title = srcPost?.title || "(제목 없음)";
        await supabase.from("admin_notifications").insert({
          event_type: "community_escalation",
          severity: draft.risk_flags?.length ? "critical" : "warning",
          message: `커뮤니티 문의 사람 처리 필요: "${title}"${draft.risk_flags?.length ? ` · 위험(${draft.risk_flags.join(", ")})` : ""} — AI 자동응답 대신 담당자가 직접 답변하세요.`,
          payload: {
            post_id: draft.post_id,
            draft_id: draft.id,
            intent: draft.intent,
            risk_flags: draft.risk_flags ?? [],
            escalated_by: session?.user?.id ?? null,
            escalated_at: new Date().toISOString(),
          },
        });
      }

      const next = escalate ? "escalated" : "rejected";
      setDrafts(prev => prev.map(d => (d.id === draft.id ? { ...d, status: next as AiDraftData["status"] } : d)));
      setSelectedDraft(null);
      setEditingBody("");
    } catch (err: any) {
      alert("처리 실패: " + err.message);
    } finally {
      setReviewBusy(false);
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
        content_en: releaseContentEn.trim() || null,
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
    setReleaseContentEn(rel.content_en || "");
    setReleaseError(null);
  };

  const handleResetForm = () => {
    setSelectedRelease(null);
    setReleaseVersion("");
    setReleaseReleasedAt(getLocalDateTimeString());
    setReleaseContent("");
    setReleaseContentEn("");
    setReleaseError(null);
  };

  // 4-3. 기능 요청 로드맵(Ethan) — 상태/반영 버전 변경 (공개 로드맵 #/roadmap 에 즉시 반영)
  const handleUpdateFeatureRequest = async (id: string, patch: Partial<Pick<FeatureRequestData, "status" | "released_version">>) => {
    setFrBusy(true);
    try {
      const { error } = await supabase
        .from("feature_requests")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setFeatureRequests(prev => prev.map(fr => (fr.id === id ? { ...fr, ...patch } : fr)));
    } catch (err: any) {
      alert("기능 요청 업데이트 실패: " + err.message);
    } finally {
      setFrBusy(false);
    }
  };

  const handleDeleteFeatureRequest = async (id: string) => {
    if (!window.confirm("이 기능 요청 클러스터를 삭제할까요? 연결된 제안 글 링크도 함께 삭제됩니다(글 자체는 유지).")) return;
    setFrBusy(true);
    try {
      const { error } = await supabase.from("feature_requests").delete().eq("id", id);
      if (error) throw error;
      setFeatureRequests(prev => prev.filter(fr => fr.id !== id));
    } catch (err: any) {
      alert("삭제 실패: " + err.message);
    } finally {
      setFrBusy(false);
    }
  };

  // 5. 90일 미활동 데이터 만료 청소 (수동 실행)
  const LAUNCH_MODE_LABEL: Record<LaunchMode, string> = {
    beta_free: "무료 베타 (전 기능 무료)",
    staged: "시험 (테스터만 결제·게이팅)",
    paid: "유료 정식 (구독 게이팅)",
  };
  const handleSetLaunchMode = async (mode: LaunchMode) => {
    if (mode === launchMode) return;
    const label = LAUNCH_MODE_LABEL[mode];
    const extra =
      mode === "staged"
        ? "\n일반 사용자는 기존 무료 베타와 동일(전 기능 무료·결제 숨김)하고, 테스터로 지정한 계정만 결제/게이팅이 적용됩니다."
        : mode === "paid"
        ? "\n전환 시 비구독자는 즉시 FREE 로 강등됩니다."
        : "";
    if (!window.confirm(`런치 모드를 [${label}] 로 전환할까요?\n모든 사용자에게 즉시 적용됩니다.${extra}`)) return;
    try {
      await setLaunchModeRemote(mode);
      setLaunchModeState(mode);
      window.alert(`런치 모드가 [${label}] 로 전환되었습니다.`);
    } catch (e: any) {
      window.alert("전환 실패 (어드민 권한 필요): " + (e?.message || e));
    }
  };

  // 강제 업데이트 게이트 — 현재 min_supported_version 로드 (시스템 탭 진입 시).
  useEffect(() => {
    if (activeTab !== "system") return;
    let alive = true;
    void getMinSupportedVersion().then((v) => {
      if (!alive) return;
      setMinVersion(v);
      setMinVersionInput(v ?? "");
    });
    return () => {
      alive = false;
    };
  }, [activeTab]);

  const handleSetMinVersion = async () => {
    const v = minVersionInput.trim();
    if (!v) {
      window.alert("버전을 입력하세요 (예: 0.9.11).");
      return;
    }
    if (!/^\d+\.\d+\.\d+/.test(v)) {
      window.alert("버전 형식이 올바르지 않습니다 (예: 0.9.11).");
      return;
    }
    if (
      !window.confirm(
        `강제 업데이트 차단을 [${v}] 로 설정할까요?\n` +
          `이 버전 미만의 v0.9.10+ 사용자는 업데이트 전까지 앱을 이용할 수 없습니다.\n` +
          `※ 반드시 ${v} 릴리스가 이미 배포돼 있어야 합니다(사용자가 받을 수 있도록).`,
      )
    )
      return;
    setMinVersionBusy(true);
    try {
      await setMinSupportedVersion(v);
      setMinVersion(v);
      window.alert(`강제 업데이트 차단이 [${v}] 로 설정되었습니다.`);
    } catch (e: any) {
      window.alert("설정 실패 (어드민 권한 필요): " + (e?.message || e));
    } finally {
      setMinVersionBusy(false);
    }
  };

  const handleClearMinVersion = async () => {
    if (!window.confirm("강제 업데이트 차단을 해제할까요? (아무도 차단되지 않습니다)"))
      return;
    setMinVersionBusy(true);
    try {
      await setMinSupportedVersion(null);
      setMinVersion(null);
      setMinVersionInput("");
      window.alert("강제 업데이트 차단이 해제되었습니다.");
    } catch (e: any) {
      window.alert("해제 실패 (어드민 권한 필요): " + (e?.message || e));
    } finally {
      setMinVersionBusy(false);
    }
  };

  // 베타 테스터 지정/해제 (staged 모드에서 결제·게이팅 적용 대상)
  const handleToggleTester = async (userId: string, next: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_beta_tester: next })
        .eq("id", userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p => (p.id === userId ? { ...p, is_beta_tester: next } : p)));
    } catch (e: any) {
      window.alert("테스터 설정 실패: " + (e?.message || e));
    }
  };

  // 관리자 강제 환불 (admin-refund Edge Function 호출, §11 M4-c)
  const handleAdminRefund = async () => {
    const orderId = refundOrderId.trim();
    if (!orderId) { window.alert("환불할 결제의 orderId 를 입력하세요."); return; }
    const amt = refundAmount.trim() ? Number(refundAmount.trim()) : undefined;
    if (amt !== undefined && (!Number.isFinite(amt) || amt <= 0)) { window.alert("환불 금액이 올바르지 않습니다."); return; }
    const label = amt ? `${amt.toLocaleString()}원 부분 환불` : "전액 환불";
    if (!window.confirm(`주문 ${orderId} 을 [${label}]${refundDowngrade ? " + FREE 강등" : ""} 처리할까요?`)) return;
    setRefundBusy(true);
    setRefundResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-refund", {
        body: { orderId, amount: amt, downgrade: refundDowngrade, reason: "관리자 콘솔 환불" },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "환불 실패");
      setRefundResult(`✅ ${data.full ? "전액" : "부분"} 환불 완료: ${Number(data.refundedAmount).toLocaleString()}원${data.downgraded ? " (FREE 강등됨)" : ""}`);
      setRefundOrderId(""); setRefundAmount("");
    } catch (e: any) {
      setRefundResult("❌ " + (e?.message || e));
    } finally {
      setRefundBusy(false);
    }
  };

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
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {currentUser && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 12px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: 12,
                }}
              >
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt="avatar"
                    referrerPolicy="no-referrer"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#5b8c7a",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {(currentUser.name || currentUser.email || "A")[0].toUpperCase()}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
                    {currentUser.name}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.5, lineHeight: 1.1 }}>
                    {currentUser.email}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    background: "rgba(91, 140, 122, 0.25)",
                    color: "#7eb09c",
                    padding: "2px 6px",
                    borderRadius: 6,
                    marginLeft: 2,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Admin
                </span>
              </div>
            )}
            
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.6,
                transition: "opacity 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 4,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
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
              { id: "qna", label: "커뮤니티 관리", icon: "info" as const },
              { id: "ai_review", label: "AI 응답 검수", icon: "sparkle" as const },
              { id: "roadmap", label: "기능 요청 로드맵", icon: "target" as const },
              { id: "alerts", label: "실시간 알림", icon: "bell" as const },
              { id: "feedback", label: "사용자 피드백", icon: "flag" as const },
              { id: "errors", label: "오류 리포트", icon: "info" as const },
              { id: "usage", label: "사용 분석", icon: "target" as const },
              { id: "releases", label: "업데이트/공지 관리", icon: "sparkle" as const },
              { id: "stretches", label: "스트레칭 템플릿 제어", icon: "target" as const },
              { id: "system", label: "시스템 제어판", icon: "settings" as const },
            ].map(tab => {
              const isAlerts = tab.id === "alerts";
              const isErrors = tab.id === "errors";
              const isFeedback = tab.id === "feedback";
              const isAiReview = tab.id === "ai_review";
              const unreadCount = isErrors
                ? clientErrors.filter(e => !e.resolved).length
                : isFeedback
                  ? notifications.filter(n => !n.read_at && n.event_type === "feedback").length
                  : isAiReview
                    ? drafts.filter(d => d.status === "pending").length
                    : isAlerts
                      ? notifications.filter(n => !n.read_at && n.event_type !== "feedback").length
                      : notifications.filter(n => !n.read_at).length;

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
                  {(isAlerts || isErrors || isFeedback || isAiReview) && unreadCount > 0 && (
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
                            <option value="plan_cache_mismatch">플랜 캐시 불일치 (mismatch)</option>
                            <option value="system_error">장애/시스템 오류 (error)</option>
                          </select>
                        </div>
                      </div>

                      {/* 모두 읽음 버튼 (피드백 제외 — 피드백은 전용 탭) */}
                      <button
                        onClick={() => handleMarkAllAsRead(n => n.event_type !== "feedback")}
                        disabled={notifications.filter(n => !n.read_at && n.event_type !== "feedback").length === 0}
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
                          opacity: notifications.filter(n => !n.read_at && n.event_type !== "feedback").length === 0 ? 0.5 : 1,
                        }}
                        onMouseEnter={e => {
                          if (notifications.filter(n => !n.read_at && n.event_type !== "feedback").length > 0) {
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
                          if (n.event_type === "feedback") return false; // 피드백은 전용 탭으로 분리
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

                {/* 5-0. 사용자 피드백 탭 */}
                {activeTab === "feedback" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {(() => {
                      const items = notifications.filter(n => n.event_type === "feedback");
                      const unread = items.filter(n => !n.read_at).length;
                      const catMeta: Record<string, { label: string; color: string }> = {
                        bug: { label: "🐞 버그", color: "#c95c5c" },
                        idea: { label: "💡 제안", color: "#d9a752" },
                        other: { label: "💬 기타", color: "#5b8c7a" },
                      };
                      const catOf = (n: AdminNotificationData) => (n.payload?.category as string) || "other";
                      const counts = {
                        bug: items.filter(n => catOf(n) === "bug").length,
                        idea: items.filter(n => catOf(n) === "idea").length,
                        other: items.filter(n => catOf(n) === "other").length,
                      };
                      const shown = feedbackCatFilter === "all" ? items : items.filter(n => catOf(n) === feedbackCatFilter);
                      return (
                        <>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>사용자 피드백</div>
                              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                                앱에서 사용자가 직접 보낸 피드백입니다. 미확인 {unread}건 · 전체 {items.length}건
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <select
                                value={feedbackCatFilter}
                                onChange={e => setFeedbackCatFilter(e.target.value as any)}
                                style={{
                                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                                  color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer",
                                }}
                              >
                                <option value="all">전체 종류 ({items.length})</option>
                                <option value="bug">🐞 버그 ({counts.bug})</option>
                                <option value="idea">💡 제안 ({counts.idea})</option>
                                <option value="other">💬 기타 ({counts.other})</option>
                              </select>
                              <button
                                onClick={() => handleMarkAllAsRead(n => n.event_type === "feedback")}
                                disabled={unread === 0}
                                style={{
                                  background: "rgba(91, 140, 122, 0.15)", color: "#5b8c7a",
                                  border: "1px solid rgba(91, 140, 122, 0.3)", borderRadius: 8,
                                  padding: "8px 16px", fontSize: 12, fontWeight: 700,
                                  cursor: unread === 0 ? "default" : "pointer", opacity: unread === 0 ? 0.5 : 1,
                                }}
                              >
                                ✓ 모두 읽음
                              </button>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "62vh", overflowY: "auto", paddingRight: 6 }}>
                            {shown.length === 0 ? (
                              <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.4, fontSize: 13 }}>
                                {items.length === 0 ? "아직 받은 피드백이 없습니다." : "이 종류의 피드백이 없습니다."}
                              </div>
                            ) : (
                              shown.map(fb => {
                                const cat = catMeta[fb.payload?.category as string] || { label: "💬 피드백", color: "#5b8c7a" };
                                const isRead = !!fb.read_at;
                                const email = fb.payload?.contact_email as string | undefined;
                                return (
                                  <div key={fb.id} style={{ border: `1px solid ${isRead ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`, borderLeft: `3px solid ${cat.color}`, borderRadius: 12, padding: "14px 16px", background: isRead ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.02)", opacity: isRead ? 0.6 : 1 }}>
                                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                          <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 5, background: `${cat.color}22`, color: cat.color }}>{cat.label}</span>
                                          {!isRead && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: "rgba(201,92,92,0.18)", color: "#ff7b72" }}>NEW</span>}
                                          <span style={{ fontSize: 11, opacity: 0.4 }}>{new Date(fb.created_at).toLocaleString()}</span>
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 8, lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{fb.message}</div>
                                        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                          {email && <span>✉ {email}</span>}
                                          {fb.payload?.client && <span>{fb.payload.client}</span>}
                                          {fb.payload?.app_version && <span>v{fb.payload.app_version}</span>}
                                          {fb.payload?.lang && <span>{fb.payload.lang}</span>}
                                          {fb.payload?.plan && <span>{fb.payload.plan}</span>}
                                          {fb.payload?.route && <span>route: {fb.payload.route}</span>}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                                        {!isRead && (
                                          <button onClick={() => handleMarkAsRead(fb.id)} style={{ background: "none", border: "none", color: "#5b8c7a", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>읽음 처리</button>
                                        )}
                                        {email && (
                                          <a href={`mailto:${email}?subject=${encodeURIComponent("[BaroSit] 피드백 회신")}`} style={{ color: "#7eb09c", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>답장</a>
                                        )}
                                        <button onClick={() => handleDeleteNotification(fb.id)} title="삭제" style={{ background: "none", border: "none", color: "rgba(201,92,92,0.7)", cursor: "pointer", padding: 4 }}>
                                          <Icon name="trash" size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 5-1. 오류 리포트 탭 */}
                {activeTab === "errors" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>클라이언트 오류 리포트</div>
                        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                          앱에서 발생한 예외를 fingerprint 로 묶어 집계합니다 (같은 오류 = 1행 + 발생 횟수). 미해결 {clientErrors.filter(e => !e.resolved).length}건 · 전체 {clientErrors.length}건
                        </div>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ccc", cursor: "pointer" }}>
                        <input type="checkbox" checked={showResolvedErrors} onChange={e => setShowResolvedErrors(e.target.checked)} />
                        해결된 항목도 표시
                      </label>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "62vh", overflowY: "auto", paddingRight: 6 }}>
                      {(() => {
                        const list = clientErrors.filter(e => showResolvedErrors || !e.resolved);
                        if (list.length === 0) {
                          return (
                            <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.4, fontSize: 13 }}>
                              {clientErrors.length === 0 ? "수집된 오류 리포트가 없습니다. 👍" : "표시할 미해결 오류가 없습니다."}
                            </div>
                          );
                        }
                        const kindColor: Record<string, string> = { react: "#c95c5c", promise: "#d9a752", window: "#5b8c7a" };
                        return list.map(err => {
                          const accent = err.resolved ? "#666" : (kindColor[err.kind] || "#9aa3b2");
                          const open = expandedError === err.id;
                          return (
                            <div key={err.id} style={{ border: `1px solid ${err.resolved ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`, borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: "14px 16px", background: err.resolved ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.02)", opacity: err.resolved ? 0.6 : 1 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: `${accent}22`, color: accent, textTransform: "uppercase" }}>{err.kind}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(201,92,92,0.15)", color: "#ff7b72" }}>×{err.count}</span>
                                    {err.resolved && <span style={{ fontSize: 10, color: "#5b8c7a" }}>해결됨</span>}
                                    <span style={{ fontSize: 11, opacity: 0.4 }}>{new Date(err.last_seen).toLocaleString()}</span>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 8, lineHeight: 1.45, wordBreak: "break-word" }}>{err.message}</div>
                                  <div style={{ fontSize: 11, opacity: 0.45, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    {err.route && <span>route: {err.route}</span>}
                                    {err.client && <span>{err.client}</span>}
                                    {err.app_version && <span>v{err.app_version}</span>}
                                    {err.lang && <span>{err.lang}</span>}
                                    {err.plan && <span>{err.plan}</span>}
                                  </div>
                                  {err.stack && (
                                    <button onClick={() => setExpandedError(open ? null : err.id)} style={{ marginTop: 8, background: "none", border: "none", color: "#5b8c7a", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                                      {open ? "스택 접기 ▲" : "스택 보기 ▼"}
                                    </button>
                                  )}
                                  {open && err.stack && (
                                    <pre style={{ marginTop: 8, padding: 12, background: "rgba(0,0,0,0.35)", borderRadius: 8, fontSize: 11, lineHeight: 1.5, color: "#ccc", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240 }}>{err.stack}</pre>
                                  )}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                                  <button onClick={() => handleToggleErrorResolved(err)} style={{ background: "none", border: "none", color: err.resolved ? "#d9a752" : "#5b8c7a", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    {err.resolved ? "되돌리기" : "해결 처리"}
                                  </button>
                                  <button onClick={() => handleDeleteError(err.id)} title="삭제" style={{ background: "none", border: "none", color: "rgba(201,92,92,0.7)", cursor: "pointer", padding: 4 }}>
                                    <Icon name="trash" size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* 5-2. 사용 분석 탭 */}
                {activeTab === "usage" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {(() => {
                      const DAY = 86400000;
                      const now = Date.now();
                      const within = (ts: string, days: number) => now - new Date(ts).getTime() <= days * DAY;
                      const installsIn = (days: number) =>
                        new Set(usageEvents.filter(e => within(e.created_at, days)).map(e => e.install_id)).size;
                      const installsForEvent = (ev: string, days = 3650) =>
                        new Set(usageEvents.filter(e => e.event === ev && within(e.created_at, days)).map(e => e.install_id));
                      // 활성화 퍼널 (install_id 기준 고유)
                      const onboarded = installsForEvent("onboarding_completed");
                      const calibOk = installsForEvent("calibration_succeeded");
                      const calibFail = installsForEvent("calibration_failed");
                      const totalInstalls = new Set(usageEvents.map(e => e.install_id)).size;
                      const conv = onboarded.size > 0 ? Math.round((calibOk.size / onboarded.size) * 100) : 0;
                      // 이벤트별 카운트
                      const counts: Record<string, number> = {};
                      for (const e of usageEvents) counts[e.event] = (counts[e.event] || 0) + 1;
                      const eventRows = Object.entries(counts).sort((a, b) => b[1] - a[1]);

                      const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 18px" }}>
                          <div style={{ fontSize: 11, opacity: 0.5 }}>{label}</div>
                          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 4 }}>{value}</div>
                          {sub && <div style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}>{sub}</div>}
                        </div>
                      );

                      if (usageEvents.length === 0) {
                        return (
                          <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.4, fontSize: 13 }}>
                            아직 수집된 사용 이벤트가 없습니다. (사용자가 앱을 켜면 익명 마일스톤이 쌓입니다)
                          </div>
                        );
                      }
                      return (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>활성화 퍼널 · 재방문</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                            <Stat label="전체 설치(고유)" value={totalInstalls} />
                            <Stat label="최근 7일 활성" value={installsIn(7)} sub="app_opened 고유 install" />
                            <Stat label="최근 30일 활성" value={installsIn(30)} />
                            <Stat label="온보딩 완료" value={onboarded.size} />
                            <Stat label="캘리브레이션 성공" value={calibOk.size} sub={`온보딩→성공 ${conv}%`} />
                            <Stat label="캘리브레이션 실패(고유)" value={calibFail.size} />
                          </div>

                          {/* 퍼널 막대 */}
                          <div style={{ marginTop: 8 }}>
                            {[
                              { label: "온보딩 완료", n: onboarded.size },
                              { label: "캘리브레이션 성공", n: calibOk.size },
                            ].map(step => {
                              const pct = totalInstalls > 0 ? Math.round((step.n / totalInstalls) * 100) : 0;
                              return (
                                <div key={step.label} style={{ marginBottom: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#ccc", marginBottom: 4 }}>
                                    <span>{step.label}</span><span>{step.n} ({pct}%)</span>
                                  </div>
                                  <div style={{ height: 8, borderRadius: 6, background: "rgba(255,255,255,0.06)" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: "#5b8c7a" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* 이벤트별 카운트 */}
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 8 }}>이벤트별 발생 수 (최근 2000건 내)</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {eventRows.map(([ev, n]) => (
                              <div key={ev} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                                <span style={{ color: "#ccc", fontFamily: "ui-monospace, monospace" }}>{ev}</span>
                                <strong style={{ color: "#fff" }}>{n}</strong>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
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
                          <th style={{ padding: 16 }}>테스터(결제 시험)</th>
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
                              <td style={{ padding: 16 }}>
                                {user.is_admin ? (
                                  <span style={{ fontSize: 11, opacity: 0.5 }}>어드민(자동)</span>
                                ) : (
                                  <button
                                    onClick={() => handleToggleTester(user.id, !user.is_beta_tester)}
                                    title="시험(staged) 모드에서 이 계정만 결제/게이팅을 적용합니다."
                                    style={{
                                      background: user.is_beta_tester ? "#e08866" : "rgba(255,255,255,0.06)",
                                      color: user.is_beta_tester ? "#1a1a1a" : "#ccc",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      borderRadius: 6,
                                      padding: "4px 10px",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {user.is_beta_tester ? "✓ 테스터" : "테스터 지정"}
                                  </button>
                                )}
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

                {/* 3. 커뮤니티 관리 탭 */}
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

                {/* 3-2. AI 응답 검수(Aria) 탭 */}
                {activeTab === "ai_review" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 24, height: "62vh" }}>
                    {/* 초안 목록 */}
                    <div style={{ borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                        에이전트 답변 초안 ({drafts.filter(d => d.status === "pending").length} 검수 대기)
                      </div>
                      {drafts.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, opacity: 0.4, fontSize: 13 }}>
                          생성된 초안이 없습니다. (글이 올라오면 cm-agent-draft 함수가 채웁니다)
                        </div>
                      ) : (
                        drafts.map(d => {
                          const statusColor = d.status === "pending" ? "#e0a04d" : d.status === "approved" ? "#5b8c7a" : "#888";
                          return (
                            <div
                              key={d.id}
                              onClick={() => { setSelectedDraft(d); setEditingBody(d.edited_body || d.draft_body || ""); }}
                              style={{
                                background: selectedDraft?.id === d.id ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.01)",
                                border: selectedDraft?.id === d.id ? "1px solid #5b8c7a" : "1px solid rgba(255,255,255,0.05)",
                                borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6,
                                opacity: d.status === "pending" ? 1 : 0.55,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, textTransform: "uppercase" }}>{d.status}</span>
                                <span style={{ fontSize: 10, opacity: 0.5 }}>{(d.intent || "?")}{!d.should_respond ? " · 개입보류" : ""}</span>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                {d.draft_body || d.reason || "(본문 없음)"}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {d.risk_flags?.map(f => (
                                  <span key={f} style={{ fontSize: 9, fontWeight: 700, color: "#c95c5c", background: "rgba(201,92,92,0.12)", padding: "1px 5px", borderRadius: 4 }}>{f}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 초안 상세 + 검수 */}
                    <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
                      {selectedDraft ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {/* 원본 글 컨텍스트 */}
                          {(() => {
                            const src = posts.find(p => p.id === selectedDraft.post_id);
                            return (
                              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6 }}>원본 글 {selectedDraft.category ? `· ${selectedDraft.category}` : ""}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{src?.title || "(글을 찾을 수 없음)"}</div>
                                <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{src?.content || ""}</div>
                              </div>
                            );
                          })()}

                          {/* 판단 메타 */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                            <span style={{ background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 6 }}>의도: {selectedDraft.intent || "?"}</span>
                            <span style={{ background: "rgba(127,119,221,0.18)", color: "#b3aef0", padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                              {selectedDraft.agent_role === "manager" ? "🗨️ 커뮤니티 매니저" : "🧘 자세 코치"}
                            </span>
                            <span style={{ background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 6 }}>언어: {selectedDraft.language}</span>
                            <span style={{ background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 6 }}>신뢰도: {selectedDraft.confidence != null ? Math.round(selectedDraft.confidence * 100) + "%" : "?"}</span>
                            <span style={{ background: selectedDraft.should_respond ? "rgba(91,140,122,0.2)" : "rgba(224,160,77,0.2)", color: selectedDraft.should_respond ? "#5b8c7a" : "#e0a04d", padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                              {selectedDraft.should_respond ? "개입 권장" : "개입 보류"}
                            </span>
                          </div>

                          {/* 사유 */}
                          {selectedDraft.reason && (
                            <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, borderLeft: "2px solid #5b8c7a", paddingLeft: 10 }}>
                              <strong>판단 사유:</strong> {selectedDraft.reason}
                            </div>
                          )}

                          {/* 위험 플래그 경고 */}
                          {selectedDraft.risk_flags?.length > 0 && (
                            <div style={{ fontSize: 12, color: "#c95c5c", background: "rgba(201,92,92,0.1)", border: "1px solid rgba(201,92,92,0.3)", borderRadius: 8, padding: "8px 12px" }}>
                              ⚠️ 위험 요소({selectedDraft.risk_flags.join(", ")}) — 사람이 직접 확인 후 처리하세요.
                            </div>
                          )}

                          {/* 근거 출처 */}
                          {selectedDraft.citations?.length > 0 && (
                            <div style={{ fontSize: 11, opacity: 0.6 }}>
                              근거: {selectedDraft.citations.map((c, i) => <span key={i}>{i > 0 ? ", " : ""}{c.url ? <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "#5b8c7a" }}>{c.title}</a> : c.title}</span>)}
                            </div>
                          )}

                          {/* 편집 가능한 답변 본문 */}
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{selectedDraft.agent_role === "pm" ? "Ethan" : "Aria"} 답변 (수정 후 게시 가능)</div>
                            <textarea
                              value={editingBody}
                              onChange={e => setEditingBody(e.target.value)}
                              placeholder="초안이 비어있습니다. 직접 작성하거나 반려하세요."
                              style={{ width: "100%", minHeight: 140, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, color: "#fff", fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                            />
                          </div>

                          {/* 검수 액션 */}
                          {selectedDraft.status === "pending" ? (
                            <div style={{ display: "flex", gap: 10 }}>
                              <button
                                onClick={() => handleApproveDraft(selectedDraft)}
                                disabled={reviewBusy}
                                style={{ flex: 1, background: "#5b8c7a", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, cursor: reviewBusy ? "default" : "pointer", opacity: reviewBusy ? 0.6 : 1 }}
                              >
                                {selectedDraft.agent_role === "pm" ? "Ethan(PM)으로 승인 · 게시" : "Aria 운영자로 승인 · 게시"}
                              </button>
                              <button
                                onClick={() => handleRejectDraft(selectedDraft, true)}
                                disabled={reviewBusy}
                                style={{ background: "rgba(224,160,77,0.15)", color: "#e0a04d", border: "1px solid rgba(224,160,77,0.4)", borderRadius: 10, padding: "12px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                              >
                                사람에게
                              </button>
                              <button
                                onClick={() => handleRejectDraft(selectedDraft, false)}
                                disabled={reviewBusy}
                                style={{ background: "none", color: "#c95c5c", border: "1px solid rgba(201,92,92,0.4)", borderRadius: 10, padding: "12px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                              >
                                반려
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.6, textAlign: "center", padding: 10 }}>
                              이미 처리됨: {selectedDraft.status}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 13 }}>
                          좌측에서 초안을 선택해 검수하세요.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. 시스템 제어판 탭 */}
                {activeTab === "system" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    {/* 강제 업데이트 게이트 (min_supported_version) */}
                    <div style={{ gridColumn: "1 / -1", background: "rgba(224, 108, 108, 0.05)", border: "1px solid rgba(224, 108, 108, 0.25)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>⛔</span>
                        강제 업데이트 게이트
                      </div>
                      <p style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.6 }}>
                        여기 설정한 버전 <strong>미만</strong>의 사용자는 업데이트하기 전까지 앱을 이용할 수 없습니다. 긴급 장애 버전을 빠르게 걷어낼 때 사용합니다.
                        <br />· 대상은 <strong>게이트가 포함된 v0.9.10 이상</strong> 사용자입니다(그 이하는 강제 불가).
                        <br />· 반영: 사용자 앱이 다음 재평가(≤30분) 또는 재시작 시 차단.
                        <br />· <strong style={{ color: "#e0a86c" }}>먼저 그 버전을 릴리스</strong>한 뒤 설정하세요 — 안 그러면 사용자가 받을 게 없습니다.
                        <br />현재 상태: {minVersion
                          ? <strong style={{ color: "#e06c6c" }}>차단 켜짐 — {minVersion} 미만 차단</strong>
                          : <strong style={{ color: "#5b8c7a" }}>꺼짐 (아무도 차단 안 됨)</strong>}
                      </p>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={minVersionInput}
                          onChange={(e) => setMinVersionInput(e.target.value)}
                          placeholder="예: 0.9.11"
                          disabled={minVersionBusy}
                          style={{
                            flex: "0 0 160px", background: "rgba(0,0,0,0.3)", color: "#fff",
                            border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
                            padding: "10px 12px", fontSize: 13,
                          }}
                        />
                        <button
                          onClick={handleSetMinVersion}
                          disabled={minVersionBusy}
                          style={{
                            background: "#e06c6c", color: "#1a1a1a",
                            border: "none", borderRadius: 8, padding: "10px 16px",
                            fontSize: 12, fontWeight: 700, cursor: minVersionBusy ? "default" : "pointer",
                            opacity: minVersionBusy ? 0.6 : 1,
                          }}
                        >
                          차단 설정/변경
                        </button>
                        <button
                          onClick={handleClearMinVersion}
                          disabled={minVersionBusy || !minVersion}
                          style={{
                            background: "rgba(255,255,255,0.06)", color: "#fff",
                            border: "none", borderRadius: 8, padding: "10px 16px",
                            fontSize: 12, fontWeight: 700,
                            cursor: minVersionBusy || !minVersion ? "default" : "pointer",
                            opacity: minVersionBusy || !minVersion ? 0.4 : 1,
                          }}
                        >
                          차단 해제
                        </button>
                      </div>
                    </div>

                    {/* 런치 모드 토글 (베타무료 ↔ 유료정식) */}
                    <div style={{ gridColumn: "1 / -1", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#5b8c7a" }}>🚀</span>
                        런치 모드 (출시 전략)
                      </div>
                      <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.6 }}>
                        <strong>무료 베타</strong>: 페이월을 숨기고 전 사용자에게 모든 PRO 기능을 개방합니다(결제 백엔드 완성 전 사용자 확보용).
                        <strong> 시험</strong>: 일반 사용자는 무료 베타와 동일(전 기능 무료·결제 숨김), <strong>테스터로 지정한 계정만</strong> 결제 UI 노출 + 정상 게이팅이 적용돼 토스 샌드박스로 결제를 시험할 수 있습니다(가입자 관리 탭에서 지정).
                        <strong> 유료 정식</strong>: 정상 구독 게이팅으로 전환합니다. 전환 시 비구독자는 즉시 FREE로 강등됩니다.
                        <br />현재 모드: <strong style={{ color: launchMode === "beta_free" ? "#d9a752" : launchMode === "staged" ? "#e08866" : "#5b8c7a" }}>{LAUNCH_MODE_LABEL[launchMode]}</strong>
                      </p>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => handleSetLaunchMode("beta_free")}
                          style={{
                            flex: 1,
                            background: launchMode === "beta_free" ? "#d9a752" : "rgba(255,255,255,0.06)",
                            color: launchMode === "beta_free" ? "#1a1a1a" : "#fff",
                            border: "none", borderRadius: 8, padding: "10px 16px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          무료 베타로 전환
                        </button>
                        <button
                          onClick={() => handleSetLaunchMode("staged")}
                          style={{
                            flex: 1,
                            background: launchMode === "staged" ? "#e08866" : "rgba(255,255,255,0.06)",
                            color: launchMode === "staged" ? "#1a1a1a" : "#fff",
                            border: "none", borderRadius: 8, padding: "10px 16px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          시험(테스터 결제)으로 전환
                        </button>
                        <button
                          onClick={() => handleSetLaunchMode("paid")}
                          style={{
                            flex: 1,
                            background: launchMode === "paid" ? "#5b8c7a" : "rgba(255,255,255,0.06)",
                            color: "#fff",
                            border: "none", borderRadius: 8, padding: "10px 16px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          유료 정식으로 전환
                        </button>
                      </div>

                      {/* 일반 사용자로 미리보기 — 어드민/테스터가 별도 계정 없이 비테스터 화면 확인 */}
                      <div style={{ marginTop: 4, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.6, flex: "1 1 320px" }}>
                          <strong>👁 일반 사용자로 미리보기</strong> — 켜면 이 브라우저에서만 어드민/테스터 권한을 무시하고
                          <strong> 일반 사용자(비테스터) 화면</strong>으로 봅니다(staged 에서 결제 숨김+전 기능 무료). 별도 계정 로그인 없이 일반 사용자 경험을 확인할 때 사용하세요. 결제/게이팅 시험은 끄고 진행.
                          {previewAsUser && <span style={{ color: "#e08866", fontWeight: 700 }}> · 현재 미리보기 켜짐</span>}
                        </div>
                        <button
                          onClick={() => { const next = !previewAsUser; setPreviewAsUser(next); setPreviewAsUserState(next); }}
                          style={{
                            background: previewAsUser ? "#e08866" : "rgba(255,255,255,0.06)",
                            color: previewAsUser ? "#1a1a1a" : "#fff",
                            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 16px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          {previewAsUser ? "✓ 미리보기 끄기" : "일반 사용자로 미리보기"}
                        </button>
                      </div>
                    </div>

                    {/* 관리자 강제 환불 (admin-refund) */}
                    <div style={{ gridColumn: "1 / -1", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#e08866" }}>💳</span>
                        관리자 강제 환불 (CS·분쟁·오결제)
                      </div>
                      <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.6 }}>
                        청약철회(7일·미사용) 제약 없이 특정 결제를 전액/부분 환불합니다. 결제 내역의 <strong>orderId</strong>를 입력하세요.
                        금액을 비우면 전액 환불됩니다. FREE 강등을 체크하면 해당 사용자를 즉시 무료 등급으로 전환합니다.
                      </p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          value={refundOrderId}
                          onChange={(e) => setRefundOrderId(e.target.value)}
                          placeholder="orderId (예: order-1779...)"
                          style={{ flex: "2 1 240px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 12 }}
                        />
                        <input
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder="금액(원) — 비우면 전액"
                          inputMode="numeric"
                          style={{ flex: "1 1 140px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 12 }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.8, cursor: "pointer" }}>
                          <input type="checkbox" checked={refundDowngrade} onChange={(e) => setRefundDowngrade(e.target.checked)} />
                          FREE 강등
                        </label>
                        <button
                          onClick={handleAdminRefund}
                          disabled={refundBusy}
                          style={{ background: "#e08866", color: "#1a1a1a", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: refundBusy ? "default" : "pointer", opacity: refundBusy ? 0.6 : 1 }}
                        >
                          {refundBusy ? "처리 중…" : "환불 실행"}
                        </button>
                      </div>
                      {refundResult && (
                        <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", color: refundResult.startsWith("✅") ? "#7eb09c" : "#f87171" }}>
                          {refundResult}
                        </div>
                      )}
                    </div>

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

                {/* 4-3. 기능 요청 로드맵(Ethan) 관리 — 상태 변경이 공개 로드맵(#/roadmap)에 즉시 반영 */}
                {activeTab === "roadmap" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 200px)", overflowY: "auto", paddingRight: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>
                        기능 요청 로드맵 ({featureRequests.length}건)
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.5 }}>
                        💡 기능 제안 글을 PM 에이전트 Ethan 이 클러스터링합니다. 상태 변경은 공개 로드맵에 즉시 반영됩니다.
                      </div>
                    </div>
                    {featureRequests.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", opacity: 0.4, fontSize: 13 }}>
                        접수된 기능 요청이 없습니다. 커뮤니티에 💡 기능 제안 글이 올라오면 Ethan 이 자동으로 접수합니다.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {featureRequests.map(fr => (
                          <div
                            key={fr.id}
                            style={{
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.05)",
                              borderRadius: 10,
                              padding: "12px 14px",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{fr.title}</div>
                              <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>
                                {fr.request_count}명 요청 · 최초 {new Date(fr.first_requested_at).toLocaleDateString()}
                              </div>
                            </div>
                            <select
                              value={fr.status}
                              disabled={frBusy}
                              onChange={e => handleUpdateFeatureRequest(fr.id, { status: e.target.value as FeatureRequestData["status"] })}
                              style={{
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 8,
                                color: "#eee",
                                padding: "6px 10px",
                                fontSize: 12,
                              }}
                            >
                              {(Object.keys(FEATURE_STATUS_LABELS) as FeatureRequestData["status"][]).map(sVal => (
                                <option key={sVal} value={sVal} style={{ color: "#222" }}>{FEATURE_STATUS_LABELS[sVal]}</option>
                              ))}
                            </select>
                            {fr.status === "done" && (
                              <input
                                type="text"
                                placeholder="반영 버전 (예: v0.9.3)"
                                defaultValue={fr.released_version ?? ""}
                                disabled={frBusy}
                                onBlur={e => {
                                  const v = e.target.value.trim() || null;
                                  if (v !== fr.released_version) handleUpdateFeatureRequest(fr.id, { released_version: v });
                                }}
                                style={{
                                  background: "rgba(255,255,255,0.05)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: 8,
                                  color: "#eee",
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  width: 140,
                                }}
                              />
                            )}
                            <button
                              type="button"
                              disabled={frBusy}
                              onClick={() => handleDeleteFeatureRequest(fr.id)}
                              style={{ background: "none", border: "none", color: "#c95c5c", fontSize: 12, cursor: "pointer" }}
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                          <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>릴리즈 노트 — 한국어 (마크다운) *</label>
                          <textarea
                            value={releaseContent}
                            onChange={e => setReleaseContent(e.target.value)}
                            placeholder="이번 릴리즈의 변경 사항을 마크다운 형식으로 작성해주세요.&#10;예:&#10;### 주요 변경 사항&#10;- 거북목 감지 성능 향상&#10;- 어드민 제어판 추가"
                            required
                            rows={10}
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

                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                            릴리즈 노트 — English (마크다운, 선택 · 영어/일본어 UI 에 노출)
                          </label>
                          <textarea
                            value={releaseContentEn}
                            onChange={e => setReleaseContentEn(e.target.value)}
                            placeholder="English release notes (optional). Shown on non-Korean UI. Leave empty to fall back to Korean on #/changelog."
                            rows={10}
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
