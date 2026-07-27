// 표시 이름 단일 소스.
//
// 배경: 상단 네비·프로필 사이드바·계정 탭이 각자 이름을 계산했는데, 계정 탭만
// profiles.name(DB)을 읽고 나머지 둘은 localStorage 캐시와 user_metadata 만 봤다.
// 이메일로 가입한 사용자는 그 둘이 모두 비어 있어 이메일로 폴백하므로, 같은 화면에서
// 카드 아바타는 "평"인데 헤더 아바타는 "T"가 되는 불일치가 났다.
//
// 해결: 해석 순서를 한 곳에 두고(DB > 로컬 캐시 > user_metadata > 이메일),
// 결과를 모듈 캐시에 담아 사용자당 한 번만 조회한다. 이름이 바뀌면 구독자에게
// 알려 헤더까지 즉시 따라오게 한다.

import { useEffect, useState } from "react";
import { supabase } from "../auth/supabase";

const LOCAL_PROFILE_KEY = "user_profile_v1";

type Cache = { userId: string; name: string };

let cache: Cache | null = null;
let inflight: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function readLocalName(): string {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    return raw ? (JSON.parse(raw).name as string | undefined)?.trim() || "" : "";
  } catch {
    return "";
  }
}

/** 로컬 캐시의 이름을 갱신한다. 캐시 자체가 없으면 이름만 담아 새로 만든다 —
 *  없으면 헤더가 계속 이메일로 폴백하기 때문에, 웹 전용 사용자에게 특히 중요하다. */
function writeLocalName(name: string): void {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    const base = raw ? JSON.parse(raw) : {};
    localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify({ ...base, name }));
  } catch {
    /* 저장 실패는 표시에만 영향 */
  }
}

/** 저장 직후 호출 — 캐시·로컬을 갱신하고 구독자에게 알린다. */
export function setDisplayName(userId: string, name: string): void {
  cache = { userId, name };
  writeLocalName(name);
  notify();
}

/** 로그아웃/계정 전환 시 다른 계정의 이름이 새지 않게 비운다. */
export function clearDisplayNameCache(): void {
  cache = null;
  inflight = null;
  notify();
}

function metaName(user: { user_metadata?: Record<string, unknown> } | null | undefined): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return ((meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? "").trim();
}

export interface DisplayUser {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

/**
 * 표시 이름과 아바타 이니셜. 이름이 아직 없으면 이메일로 폴백한다(이니셜만 이메일 기반).
 * DB 조회는 사용자당 1회이며 결과는 모듈 캐시에 남아 다른 컴포넌트가 재사용한다.
 */
export function useDisplayName(user: DisplayUser | null | undefined): { name: string; initial: string } {
  const userId = user?.id;
  const [, force] = useState(0);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (cache?.userId === userId || inflight === userId) return;
    inflight = userId;
    void (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
        if (!error) {
          const name = ((data?.name as string | undefined) ?? "").trim();
          cache = { userId, name };
          if (name) writeLocalName(name);
          notify();
        }
      } catch {
        /* 조회 실패 시 로컬·메타데이터 폴백으로 표시된다 */
      } finally {
        if (inflight === userId) inflight = null;
      }
    })();
  }, [userId]);

  const fromDb = cache && cache.userId === userId ? cache.name : "";
  const name = fromDb || readLocalName() || metaName(user);
  const initial = (name || user?.email || "?").trim().charAt(0).toUpperCase();
  return { name, initial };
}
