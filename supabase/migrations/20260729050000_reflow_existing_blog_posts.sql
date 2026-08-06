-- 기발행 블로그 51편 본문 재배치 (유저 지시 2026-07-29: "기존 블로그 글에도 반영해서 발행").
-- prod 적용 완료 — 이 파일은 기록용(다른 블로그 시드와 마찬가지로 git 커밋하지 않음).
--
-- 배경: 서식 개선의 근본 해결은 렌더러 패치(브랜치 feat/blog-post-formatting)지만
--       토스 계약심사 중 src/ 머지 동결이라 당장 라이브에 반영할 수 없다.
--       본문은 pre-wrap 이라 "빈 줄"은 코드 없이도 그대로 살아나므로, 문단 재배치만 데이터로 선반영한다.
--       → 소제목 굵게/색은 심사 통과 후 패치 머지로 자동 적용(51편 전부가 번호 소제목을 쓰고 있음).
--
-- 절대 원칙: 공백 배치만 바꾸고 글자는 하나도 바꾸지 않는다.
--   적용 전 스냅샷과 대조해 어긋나면 RAISE EXCEPTION 으로 전체 롤백하도록 했다.
--
-- 실측(적용 전후):
--   · 대상 51편 중 48편 변경(2026-07-29 발행 3편은 이미 짧은 문단이라 무변화 = 멱등)
--   · 글자 유실·변형 0건
--   · 최장 문단 820자 → 296자 (출처 인용 줄은 쪼개면 안 되므로 의도적으로 제외)
--   · 남은 260자 초과 문단 5개 = 한 문장이 통째로 긴 경우라 더 쪼갤 수 없음
--
-- 함정 기록:
--   · text[] || '' 는 빈 문자열을 배열 리터럴로 해석해 실패 → array_append 사용
--   · 문장 끝 인식에서 마침표 뒤 닫는 따옴표(…sustainability." 다음 문장)를 놓쳐 411자 문단이 안 쪼개졌음
--     → [.!?] 뒤 닫는 따옴표·괄호 1개를 허용. 소수점("0.74")은 뒤에 숫자가 오므로 여전히 안전
--   · 일본어는 공백이 없어 。 기준으로 끊되, 「…。」 는 닫는 괄호 뒤에서 끊는다

CREATE OR REPLACE FUNCTION public.blog_reflow_body(src text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  mark   text := chr(1);
  line   text;
  t      text;
  tmp    text;
  sent   text;
  buf    text := '';
  cnt    int  := 0;
  outl   text[] := ARRAY[]::text[];
BEGIN
  FOREACH line IN ARRAY string_to_array(coalesce(src, ''), E'\n') LOOP
    t := btrim(line);

    IF t = '' THEN
      outl := array_append(outl, '');
      CONTINUE;
    END IF;

    -- 소제목 / 불릿(출처 인용) / 짧은 문단은 손대지 않는다
    IF t ~ '^([①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2}\.)[[:space:]]'
       OR t ~ '^[▸•·][[:space:]]'
       OR length(t) <= 160 THEN
      outl := array_append(outl, t);
      CONTINUE;
    END IF;

    tmp := regexp_replace(t,   '([.!?][”"’''）)]?) ', '\1' || mark, 'g');
    tmp := regexp_replace(tmp, '。([」）])',          '。\1' || mark, 'g');
    tmp := regexp_replace(tmp, '。([^」）])',         '。' || mark || '\1', 'g');

    buf := '';
    cnt := 0;
    FOREACH sent IN ARRAY string_to_array(tmp, mark) LOOP
      sent := btrim(sent);
      IF sent = '' THEN CONTINUE; END IF;
      IF buf <> '' AND (length(buf) + length(sent) > 200 OR cnt >= 2) THEN
        outl := array_append(outl, buf);
        outl := array_append(outl, '');
        buf := '';
        cnt := 0;
      END IF;
      buf := CASE WHEN buf = '' THEN sent ELSE buf || ' ' || sent END;
      cnt := cnt + 1;
    END LOOP;

    IF buf <> '' THEN
      outl := array_append(outl, buf);
    END IF;
  END LOOP;

  RETURN array_to_string(outl, E'\n');
END;
$fn$;

SET session_replication_role = replica;

CREATE TEMP TABLE _blog_before AS
  SELECT id, regexp_replace(content, '[[:space:]]', '', 'g') AS s
  FROM public.posts
  WHERE is_agent AND category = '📝 블로그';

UPDATE public.posts p
   SET content = public.blog_reflow_body(p.content)
 WHERE p.is_agent AND p.category = '📝 블로그';

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
    FROM public.posts p
    JOIN _blog_before b ON b.id = p.id
   WHERE regexp_replace(p.content, '[[:space:]]', '', 'g') <> b.s;
  IF bad > 0 THEN
    RAISE EXCEPTION '본문 글자가 달라진 글 %건 — 전체 롤백', bad;
  END IF;
END $$;

DROP TABLE _blog_before;
SET session_replication_role = DEFAULT;

-- 일회성 작업이므로 헬퍼 함수는 남기지 않는다(정의는 이 파일에 보존).
DROP FUNCTION IF EXISTS public.blog_reflow_body(text);
