-- 블로그 "습관 21일"(2026-07-31 발행) 3언어에 실제 크로스링크 URL 추가.
--
-- 배경(2026-08-03 실측): 발행 57편 중 다른 블로그 글로 가는 내부 링크가 0건이었다.
--   시드 주석에는 "4호 크로스링크", "실행 의도 글 크로스링크"라고 계속 적어 왔는데
--   정작 본문에는 "앞선 글에서 다룬 적이 있습니다"처럼 언급만 하고 URL 을 넣은 적이 없다.
--   → 사이트맵으로 발견은 되지만 링크 그래프에서 고립돼 페이지 간 권위 전달·주제 클러스터
--     인식이 되지 않는 상태. 해시태그보다 이쪽이 실제 SEO 손실이다.
--
-- 짝 함수: functions/community/p/[id].ts 의 linkifyBarositUrls() 가 같은 날 추가됨.
--   noscript(크롤러용) 본문에서 barosit.com URL 을 <a> 로 승격하므로, 이 URL 들이
--   실제 링크로 크롤링된다. 브라우저 화면에서 클릭 가능하게 만드는 건 formatPostBody()
--   쪽이라 토스 심사 통과 후 머지 건과 함께 처리.
--
-- 연결 방향: 각 언어판 → 같은 언어의 실행 의도 글(2026-07-27 발행, group d96ae241).
--   ko d96ae241-6a6f-4495-b03b-e1d2d2289407 / en 6dfe7753-d2cf-430e-8439-0c4815e8ad51
--   / ja 731c35cb-a1a0-4545-9d32-fbe865d05c99
--   축 분리: 실행 의도 = 계획을 어떤 '형식'으로 적나 / 이 글 = 얼마나 '걸리나'.
--
-- UPDATE 이므로 트리거 우회 필요(발행 시드와 동일 방식).

SET session_replication_role = replica;

-- ko
UPDATE public.posts SET content = replace(
  content,
  '계획을 어떤 형식으로 적으면 실제로 하게 되는지는 앞선 글에서 다룬 적이 있습니다. 앉아 있는 시간과 움직임에 대한 근거는 barosit.com/science 에 정리해 두었습니다.',
  '계획을 어떤 형식으로 적으면 실제로 하게 되는지는 앞선 글에서 다뤘습니다.
→ barosit.com/community/p/d96ae241-6a6f-4495-b03b-e1d2d2289407

앉아 있는 시간과 움직임에 대한 근거는 barosit.com/science 에 정리해 두었습니다.'
) WHERE id = '42fa46ad-7cc9-49f3-b396-7a39372db79c';

-- en
UPDATE public.posts SET content = replace(
  content,
  'An earlier post covered how the format you write a plan in changes whether you act on it. The evidence on sitting time and movement is collected at barosit.com/science.',
  'An earlier post covered how the format you write a plan in changes whether you act on it.
→ barosit.com/community/p/6dfe7753-d2cf-430e-8439-0c4815e8ad51

The evidence on sitting time and movement is collected at barosit.com/science.'
) WHERE id = 'e6f727bc-0bae-481c-8d90-d0ca7b1e0b47';

-- ja
UPDATE public.posts SET content = replace(
  content,
  '計画をどんな形式で書くと実際に行動につながるかは、以前の記事で扱っています。座っている時間と動きについての根拠は barosit.com/science にまとめてあります。',
  '計画をどんな形式で書くと実際に行動につながるかは、以前の記事で扱っています。
→ barosit.com/community/p/731c35cb-a1a0-4545-9d32-fbe865d05c99

座っている時間と動きについての根拠は barosit.com/science にまとめてあります。'
) WHERE id = '7f2042cd-a2e5-4efa-8fe7-a97746fba804';

-- 세 건 모두 치환됐는지 확인 — 하나라도 원문과 안 맞아 미치환이면 롤백한다.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.posts
   WHERE id IN ('42fa46ad-7cc9-49f3-b396-7a39372db79c',
                'e6f727bc-0bae-481c-8d90-d0ca7b1e0b47',
                '7f2042cd-a2e5-4efa-8fe7-a97746fba804')
     AND content LIKE '%/community/p/%';
  IF n <> 3 THEN
    RAISE EXCEPTION '크로스링크 치환 실패: %/3 건만 반영됨 (원문 문자열 불일치)', n;
  END IF;
END $$;

SET session_replication_role = DEFAULT;
