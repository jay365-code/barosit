-- 서버에서 나가는 거래 메일(결제 실패·강등·환불·구독 해지·탈퇴 접수/취소)의
-- 언어를 정하기 위한 컬럼. UI 언어는 그동안 localStorage 에만 있어 Edge
-- Function 이 알 수 없었고, 그 결과 en/ja 사용자에게도 한국어 메일이 나갔다.
--
-- null 이면 _shared/email.ts 의 userMailLang() 이 ko 로 떨어진다 — 이 컬럼이
-- 없던 시절의 가입자는 한국어 UI 사용자였다.
alter table public.profiles
  add column if not exists preferred_lang text;

alter table public.profiles
  drop constraint if exists profiles_preferred_lang_check;

alter table public.profiles
  add constraint profiles_preferred_lang_check
  check (preferred_lang is null or preferred_lang in ('ko', 'en', 'ja'));

comment on column public.profiles.preferred_lang is
  '마지막으로 선택한 UI 언어(ko/en/ja). 서버 발송 메일의 언어 선택에만 쓴다. null 이면 ko 로 처리.';
