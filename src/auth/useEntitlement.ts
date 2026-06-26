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
import { resolveEffectivePlan, isBetaFree } from "../launchMode";

const CACHE_KEY = "barosit:subscription_plan";
const VERIFIED_AT_KEY = "barosit:plan_verified_at";
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
  // 시드: 베타(체험) 모드면 PRO, 아니면 캐시값 (legit PRO 가 검증 완료 전 차단되지 않도록 즉시 사용)
  const [plan, setPlan] = useState<"free" | "pro">(() =>
    isBetaFree() ? "pro" : readCache(),
  );
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
        // 오프라인/조회 실패(사내 방화벽·망분리·일시적 네트워크 단절).
        // 1) 베타(무료체험) 모드면 서버와 무관하게 PRO — 체험은 Pro 와 동일 처리.
        if (isBetaFree()) {
          apply("pro", false);
          return;
        }
        // 2) 유료 모드: 이 기기에서 과거 서버 검증이 1회라도 성공했다면(=정당히 PRO 였던
        //    사용자) 재검증이 막혀도 강등하지 않는다 — 데스크톱 Pro 가 차단망·오프라인에서
        //    끊기지 않게 한다(로그인 자체가 온라인을 요구하므로 정당한 Pro 는 at>0 보장).
        //    온라인 복구 시 verify() 가 서버값으로 다시 정정(해지/환불은 재검증 때 강등).
        //    검증 이력이 전혀 없으면(캐시를 신뢰할 수 없음) 보수적으로 FREE.
        try {
          const at = Number(localStorage.getItem(VERIFIED_AT_KEY) || 0);
          if (!at) apply("free", false);
          // at > 0 → 마지막 plan(시드/직전 검증값) 유지. 강등 없음.
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
