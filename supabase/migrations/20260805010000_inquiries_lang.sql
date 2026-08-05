-- 문의 접수 확인 메일을 문의자의 언어로 보내기 위한 컬럼.
-- send-inquiry-email 이 record.lang 을 읽어 ko/en/ja 템플릿을 고른다.
-- 비어 있으면 함수가 ko 로 떨어진다 — 이 컬럼이 없던 시절의 행은 한국어 문의였다.
alter table public.inquiries
  add column if not exists lang text;

alter table public.inquiries
  drop constraint if exists inquiries_lang_check;

alter table public.inquiries
  add constraint inquiries_lang_check
  check (lang is null or lang in ('ko', 'en', 'ja'));

comment on column public.inquiries.lang is
  '문의 작성 시점의 UI 언어(ko/en/ja). 접수 확인 메일 언어 선택에 쓴다. null 이면 ko 로 처리.';
