-- 다국어 블로그 목록에서 한국어(원본) 대신 일본어/영어 번역이 뜨는 버그 수정.
--
-- 원인: 커뮤니티 목록은 created_at DESC 로 최신 N개(raw)만 가져온 뒤 번역그룹을
--   1개로 접는다(dedupeByGroup). 그런데 시드 과정에서 원본(anchor=ko, id=group_id)이
--   번역행(ja/en)보다 created_at 이 "더 오래된" 그룹이 있어, 글 수가 페이지 한도(20)를
--   넘는 순간 가장 오래된 원본이 커트라인 밖으로 밀리고 번역행만 window 에 남는다.
--   그러면 접기 로직이 원본을 못 찾아 다른 언어로 폴백 → KO 화면에 JA 글이 노출.
--
-- 처방: 각 번역그룹의 원본(anchor) 행을 "그룹 내 최신 시각 + 1초"로 올려, 항상 그룹에서
--   가장 새 행이 되게 한다. 목록이 아래에서 잘릴 때 먼저 잘리는 건 번역행이고 원본은
--   마지막까지 남으므로, "번역행만 남아 폴백" 상황이 구조적으로 발생하지 않는다.
--   (표시 언어/카테고리 무관하게 원본이 fallback 으로 항상 존재 → dedupe 안정)

update posts p
set created_at = s.sib_max + interval '1 second'
from (
  select translation_group_id, max(created_at) as sib_max
  from posts
  where translation_group_id is not null
    and id <> translation_group_id   -- 원본을 제외한 번역행들만
  group by translation_group_id
) s
where p.id = p.translation_group_id  -- 원본(anchor) 행만 갱신
  and p.translation_group_id = s.translation_group_id;
