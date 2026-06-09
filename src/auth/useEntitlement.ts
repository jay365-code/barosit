// 서버 검증 기반 구독 권한(entitlement) 훅 — §7 E3-② 보완.
//
// 문제: 모니터링/동기화 게이트가 localStorage('barosit:subscription_plan')를 직접
//   읽어, 사용자가 devtools 로 'pro' 로 바꾸면 결제 없이 PRO 기능이 켜졌다.
// 해결: 이 훅이 마운트/포커스/주기/구독변경 시 Supabase user_subscriptions 를
//   직접 재조회(RLS·트리거로 사용자가 위조 불가)해 실효 플랜을 산정하고, 그 결과를
//   in-memory state 로 돌려준다. 게이트는 localStorage 가 아니라 이 값을 신뢰하므로,
//   캐시를 조작해도 다음 검증(수 초~주기) 때 서버 값으로 덮어써져 자동 강등된다.
//   캐시(localStorage)는 오프라인 부팅 시 첫 깜빡임을 없애는 시드로만 쓴다.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { resolveEffectivePlan } from "../launchMode";

const CACHE_KEY = "barosit:subscription_plan";
const VERIFIED_AT_KEY = "barosit:plan_verified_at";
// 오프라인으로 이 기간 이상 서버 검증을 못 하면 보수적으로 FREE 로 강등(권한 무한 잔존 방지).
const STALE_MAX_MS = 14 * 24 * 60 * 60 * 1000;
const REVERIFY_MS = 10 * 60 * 1000;

function readCache(): "free" | "pro" {
  try {
    return (localStorage.getItem(CACHE_KEY) as "free" | "pro") || "free";
  } catch {
    return "free";
  }
}

export interface Entitlement {
  plan: "free" | "pro";
  /** 이번 세션에서 서버 검증이 1회 이상 성공했는지 (false 면 캐시 시드 값) */
  verified: boolean;
}

export function useEntitlement(): Entitlement {
  // 시드: 캐시값 (legit PRO 사용자가 검증 완료 전 차단되지 않도록 즉시 사용)
  const [plan, setPlan] = useState<"free" | "pro">(readCache);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const apply = (p: "free" | "pro", didVerify: boolean) => {
      if (cancelled) return;
      try {
        localStorage.setItem(CACHE_KEY, p);
        if (didVerify) localStorage.setItem(VERIFIED_AT_KEY, String(Date.now()));
      } catch {
        /* localStorage 미지원 — 무시 */
      }
      setPlan(p);
      if (didVerify) setVerified(true);
    };

    const verify = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          apply("free", true); // 비로그인 → 권한 없음 (서버 확인됨)
          return;
        }
        const { data, error } = await supabase
          .from("user_subscriptions")
          .select("plan_id, status, current_period_end")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (error) throw error; // 네트워크/RLS 실패 → catch 에서 staleness 판정

        const effective = resolveEffectivePlan(data); // 베타 모드면 pro

        // 변조 감지: 캐시는 PRO 인데 서버 실효 플랜은 FREE → 격하 + critical 경보
        if (effective === "free" && readCache() === "pro") {
          try {
            await supabase.from("admin_notifications").insert({
              event_type: "tampering_detected",
              severity: "critical",
              message: `권한 변조 감지(모니터링 게이트): user ${session.user.email ?? session.user.id} 로컬 캐시 PRO ↔ 서버 FREE. 자동 강등 처리.`,
              payload: { user_id: session.user.id, cached: "pro", server: "free", at: new Date().toISOString() },
            });
          } catch {
            /* 경보 적재 실패는 강등을 막지 않는다 */
          }
        }
        apply(effective, true);
      } catch {
        // 오프라인/조회 실패 → 마지막 검증 시각 기준 판정
        try {
          const at = Number(localStorage.getItem(VERIFIED_AT_KEY) || 0);
          if (!at || Date.now() - at > STALE_MAX_MS) {
            apply("free", false); // 너무 오래 미검증 → 보수적 강등
          }
          // 그 외(최근 검증 이력 있음) → 캐시 시드 값 유지
        } catch {
          /* noop */
        }
      }
    };

    verify();
    const onChange = () => { void verify(); };
    window.addEventListener("barosit:subscription-changed", onChange);
    window.addEventListener("focus", onChange);
    const id = window.setInterval(() => { void verify(); }, REVERIFY_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("barosit:subscription-changed", onChange);
      window.removeEventListener("focus", onChange);
      window.clearInterval(id);
    };
  }, []);

  return { plan, verified };
}
