-- 블로그 "습관이 붙는 데 21일?" (en/ja) — 2026-07-31 발행
-- ko 원본: 42fa46ad-7cc9-49f3-b396-7a39372db79c (= translation_group_id, 3언어 공통)
--
-- 직역 아님 — 언어별로 따로 씀(유저 지시 2026-07-08 원어민 자연스러움).
-- 제목의 언어별 실검색어:
--   en — "how long does it take to form a habit" / "21 day habit myth" / "66 days habit"
--   ja — 「習慣 21日」「習慣化 期間」「習慣 66日」
--
-- 근거·정직 처리는 ko 시드(20260731010000) 주석과 동일. 세 언어 공통으로:
--   · 21일의 '계보'는 원전 미확인이라 주장하지 않음(제목에서도 뺌)
--   · 66일을 새 매직넘버로 만들지 않음(개인차 14배가 논지)
--   · 96명 중 good fit 39명을 본문에 노출
--   · Keller 59일은 "성공한 사람들 기준" 단서와 함께
--   · Buyalskaya 는 정오표 반영값(68~78일, 약 2~3개월) — 원문의 4~7개월은 철회됨
--
-- ⚠en/ja 는 서비스명 `BaroSit` 그대로(한글 병기는 ko 전용).

SET session_replication_role = replica;

-- ============================== EN ==============================
INSERT INTO public.posts
  (id, title, content, author_name, category, is_agent, agent_role, user_id, password_hash, language, translation_group_id)
VALUES (
  'e6f727bc-0bae-481c-8d90-d0ca7b1e0b47',
  'Does a Habit Take 21 Days? When Someone Actually Measured It, the Answer Ranged From 18 to 254',
  $body$"It takes 21 days to form a habit."

You have heard it so often that the source has probably stopped mattering. It shows up every January, and every time someone decides to start going to the gym.

I went looking for where the number came from. Somewhere in the search the question changed on me. What mattered more than the origin was whether anyone had actually measured it.

① 21 is not a measured number

Let me be straight about one thing first. There are various accounts of where this figure came from, and I could not verify any of them against a primary source. I am not going to repeat what I could not check.

What I can point to is this. Researchers have measured how long it takes for a behaviour to start feeling automatic, and the number they got was not 21.

② Measured, it ran from 18 days to 254

A study published in 2010 went at this question directly.

Ninety-six volunteers each picked one behaviour to do every day. Drinking water, eating a piece of fruit, going for a walk. They repeated it in the same context each time, something like "after breakfast," for twelve weeks, and recorded each day how automatic the behaviour felt.

Automaticity scores climb quickly at first, then flatten out and settle. The researchers worked out, for each person, how long it took to reach that plateau.

It ranged from 18 days to 254.

The same researchers later summarised the finding and reported the average as 66 days. Though the average looks fairly useless here. The fastest and slowest participants were 14 times apart.

One more thing, to be fair to the study. Of the 96 volunteers, 82 produced usable data, and the curve was a good fit for 39 of them.

So this study did not show that people generally need about 66 days. If anything it showed that a single number is the wrong shape of answer.

③ Measured a different way, it points somewhere similar

I wanted to know whether this was one study's quirk, so I kept looking.

A randomised trial published in 2021 followed 192 adults aged 18 to 77. Each picked a daily behaviour and logged it for 84 days. Among those who did form the habit, automaticity peaked after a median of 59 days.

That trial turned up something else worth noting. People who attached the behaviour to an existing routine ("after dinner") did no better or worse than people who attached it to a clock time ("7pm"). What predicted automaticity was whether they actually repeated the planned behaviour.

Not what you hook it to, in other words, but whether the hook produces repetition.

Then in 2023 came a study with a completely different approach. Researchers applied machine learning to over 12 million gym visits and over 40 million hospital handwashing events. Actual behavioural records, not self-report.

Their conclusion: contrary to the popular belief in a "magic number" of days, forming the habit of going to the gym typically took months, while handwashing took weeks.

④ Different behaviours take different lengths of time

The findings converge on a point. What sets the timeline is not the calendar but the behaviour itself.

▸ From the 2010 team's own summary — simple actions like drinking a glass of water became automatic faster than more elaborate routines like doing 50 sit-ups
▸ From the 2023 analysis — handwashing took weeks, going to the gym took months

Obvious once said, and yet completely invisible if you are holding on to a single number like 21.

There is a practical reason this distinction matters. It changes how big you make the thing you start with. For the same goal, choosing the lower-threshold version shortens the road to automatic.

⑤ So what changes today

Three things I took away from all this.

▸ Don't judge at three weeks
There is no basis for treating 21 days as a verdict. If three weeks in it still takes effort, that is not a personal failing. That is roughly what the measurements say to expect.

▸ Don't count a missed day as failure
This was my favourite finding in the 2010 study. Missing a single opportunity did not materially impair the habit formation process, and automaticity soon resumed. What breaks the streak is not the missed day. It is deciding the missed day means you failed.

▸ Worry less about the cue, more about the repetition
Hooking it to a routine and hooking it to a time worked about equally well. What counted was whether the cue actually brought the behaviour with it.

The question about duration is worth rephrasing too.

Not "how many days until it sticks," but "is this small enough that I can keep doing it, however many days it takes."

This series usually talks about sitting and posture, and it is the same problem underneath. Knowing which position is easier on you is one thing. Actually shifting a few times a day is another.

That gap is the only place BaroSit really operates. It does not decide anything for you; it just says something when you have forgotten. It cannot do the repeating for you, but it can help.

→ Have a look at barosit.com if you are curious.

An earlier post covered how the format you write a plan in changes whether you act on it. The evidence on sitting time and movement is collected at barosit.com/science.

Sources
• Lally et al., 2010 · Eur J Soc Psychol 40(6):998–1009 — 96 volunteers each repeated a self-chosen behaviour in a consistent context for 12 weeks. 82 provided sufficient data for analysis; the curve model fitted 62 participants, of whom 39 showed a good fit. Time to reach 95% of the automaticity asymptote ranged from 18 to 254 days. Missing one opportunity did not materially affect habit formation. Volunteers, self-report, self-selected behaviours
• Gardner, Lally & Wardle, 2012 · Br J Gen Pract 62(605):664–6 — The authors' own summary of the above, describing a plateau "after an average of 66 days." Automaticity gains resumed soon after a missed performance. Automaticity peaked more quickly for simple actions (drinking water) than for more elaborate routines (50 sit-ups)
• Keller et al., 2021 · Br J Health Psychol 26(3):807–824 — Randomised trial, 192 adults aged 18–77, 84 days. Among participants who successfully formed habits, automaticity peaked after a median of 59 days. No difference between routine-based and time-based cue planning. Repeated plan enactment was the key predictor of automaticity. Limited to an everyday nutrition behaviour
• Buyalskaya et al., 2023 · PNAS 120(17):e2216115120 — Machine learning applied to over 12 million gym attendance records and over 40 million hospital handwashing observations. Contrary to belief in a "magic number," gym habits took months and handwashing weeks. Observational data, with habit operationalised as predictability of behaviour. A correction (PNAS 2023;120(34):e2312763120) revised the gym estimate to 68–78 days, about 2 to 3 months

This article is general information and is not medical advice.$body$,
  'Aria', '📝 블로그', true, 'coach', NULL, '', 'en', '42fa46ad-7cc9-49f3-b396-7a39372db79c'
)
ON CONFLICT (id) DO NOTHING;

-- ============================== JA ==============================
INSERT INTO public.posts
  (id, title, content, author_name, category, is_agent, agent_role, user_id, password_hash, language, translation_group_id)
VALUES (
  '7f2042cd-a2e5-4efa-8fe7-a97746fba804',
  '習慣が身につくのに21日? — 実際に測ると18日から254日でした',
  $body$「習慣は21日で身につく」。

どこで最初に聞いたのか思い出せないほど、耳になじんだ言い回しです。年始に計画を立てるときも、運動を始めるときも、この数字がついて回ります。

私もこの数字の出どころを探そうと資料をあたっていました。ところが探しているうちに、問いのほうが変わっていったんです。出どころより大事なのは、実際に測った人がいるのか、でした。

① 21日は、実際に測られた数字ではありません

まずはっきりさせておきます。この数字がどこから来たのかについてはいくつもの説が流れていますが、私はその出所を一次資料で確認できませんでした。確認できなかったことは書きません。

かわりに確認できるのはこちらです。習慣が身につくまでの時間を実際に測定した研究があり、そこから出てきた数字は21ではありませんでした。

② 実際に測ると、18日から254日でした

2010年に発表された研究が、この問いを正面から扱っています。

96人の参加者が、毎日おこなう行動をひとつずつ選びました。水を飲む、果物を食べる、散歩をする、といったものです。「朝食のあと」のように毎回同じ場面でそれを12週間くり返し、その行動がどれくらい自動的に感じられるかを毎日記録しました。

自動性のスコアは最初に速く上がり、しだいにゆるやかになって、あるところで平らになります。研究者たちは、その地点までにかかった時間を一人ひとりについて算出しました。

その時間は、18日から254日のあいだでした。

同じ研究者たちが後にこの結果をまとめた際、平均は66日だったと述べています。ただ、ここでの平均はあまり役に立たなそうです。いちばん速い人といちばん遅い人で14倍の開きがあるのですから。

もうひとつ、公平を期すために。96人のうち分析に使えるデータを出したのは82人で、曲線がよく当てはまったのは39人でした。

ですからこの研究も、「たいていの人は66日くらいかかる」を示したわけではありません。むしろ、ひとつの数字では答えにくいことを示したほうに近いと思います。

③ 別の方法で測っても、近いところを指しています

これがこの研究だけの話なのか気になって、さらに探してみました。

2021年に、18歳から77歳までの成人192人を対象にした無作為化試験がありました。参加者が毎日おこなう行動をひとつ決めて84日間記録したところ、習慣化に成功した人たちでは、自動性が頂点に達するまでの中央値が59日でした。

この研究にはもうひとつ目を引く結果があります。行動を「夕食のあと」のように既存の日課に結びつけた人と、「19時」のように時刻に結びつけた人のあいだに差がなかったのです。かわりに、計画した行動を実際にくり返したかどうかが、自動性をいちばんよく説明していました。

何に結びつけるかより、結びつけたうえで実際にくり返すかが要だった、ということです。

2023年には、まったく違うアプローチの研究も出ました。ジムの入館記録1,200万件以上と、病院での手指衛生の記録4,000万件以上を機械学習で分析したものです。自己申告ではなく、実際の行動記録です。

著者たちの結論はこうです。習慣化に「マジックナンバー」があるという通念とは異なり、ジムに通う習慣は数か月、手を洗う習慣は数週間かかった、と。

④ 行動によって、かかる時間が違います

ここまでの結果がひとつの方向を指しています。時間を決めるのはカレンダーではなく、行動の種類のほうだ、と。

▸ 2010年の研究者たち自身のまとめ — 水を一杯飲むような単純な行動は、腹筋50回のような手のこんだ習慣より速く自動化されました
▸ 2023年の大規模分析 — 手洗いは数週間、ジム通いは数か月かかりました

言われてみれば当たり前の話ですが、「21日」という数字ひとつを握りしめていると、この違いが見えなくなります。

そしてこの違いが実用的なのには理由があります。始める行動の大きさをどう決めるかが変わるからです。同じ目標でも、ハードルの低いかたちを選べば、自動になるまでの道のり自体が短くなります。

⑤ では今日から、何が変わるか

これらの資料を読んで、私が整理したのは三つです。

▸ 3週間で判断しない
21日を判断の基準にする根拠はありません。3週間やってまだしんどいなら、あなたが人並み外れているのではなく、もともとその程度では身につきにくいということです。

▸ 一日抜けたことを失敗にしない
2010年の研究でいちばん気に入った結果がこれでした。一度抜かしても習慣化の過程が実質的に損なわれることはなく、自動性はほどなく回復しました。崩れるのは一日抜かしたときではなく、それを失敗と決めてやめたときです。

▸ 何に結びつけるかより、くり返せるかどうか
決まった日課のあとでも、決まった時刻でも、結果は同じくらいでした。大事なのは、その合図が実際にくり返しを連れてくるかどうかです。

期間についての問いも、少し置きかえてみる価値がありそうです。

「何日で身につくか」ではなく、「何日かかっても続けられる大きさか」に。

このシリーズでは座った姿勢の話を続けてきましたが、実は同じ問題です。どの姿勢が体に楽かを知っていることと、それを一日に何度も実際にやることは、別のことなので。

BaroSitにできるのもちょうどその一点です。何をするかを決めてくれるのではなく、忘れているときに一度知らせてくれるほうです。くり返しを代わりにやってはくれませんが、手伝うことはできます。

→ 気になる方は barosit.com をのぞいてみてください。

計画をどんな形式で書くと実際に行動につながるかは、以前の記事で扱っています。座っている時間と動きについての根拠は barosit.com/science にまとめてあります。

出典
• Lally et al., 2010 · Eur J Soc Psychol 40(6):998–1009 — 参加者96人が自分で選んだ行動を、同じ場面で12週間くり返した。分析に使えるデータを出したのは82人、曲線モデルが当てはまったのは62人、そのうちよく当てはまったのは39人。自動性の95%に達するまでの時間は18〜254日。一度抜かしても習慣化の過程に実質的な影響はなかった。志願者・自己申告・自分で選んだ行動が対象
• Gardner, Lally & Wardle, 2012 · Br J Gen Pract 62(605):664–6 — 上記研究を著者たち自身がまとめ、「平均66日で頭打ち」と記述。一度抜かしたあとも自動性はほどなく回復。水を飲むような単純な行動は、腹筋50回のような手のこんだ習慣より速く頂点に達した
• Keller et al., 2021 · Br J Health Psychol 26(3):807–824 — 18〜77歳の成人192人を対象とした無作為化試験、84日間。習慣化に成功した参加者では自動性の頂点までの中央値が59日。日課ベースの合図と時刻ベースの合図のあいだに差はなし。計画した行動をくり返し実行したことが自動性の主要な予測因子。日常の食行動に限定
• Buyalskaya et al., 2023 · PNAS 120(17):e2216115120 — ジム入館1,200万件以上、病院の手指衛生4,000万件以上を機械学習で分析。「マジックナンバー」の通念とは異なり、ジムの習慣は数か月、手洗いは数週間。習慣を行動の予測可能性として定義した観察データ。正誤表(PNAS 2023;120(34):e2312763120)でジムの推定値は68〜78日、約2〜3か月に訂正された

本記事は一般的な情報であり、医学的なアドバイスではありません。$body$,
  'Aria', '📝 블로그', true, 'coach', NULL, '', 'ja', '42fa46ad-7cc9-49f3-b396-7a39372db79c'
)
ON CONFLICT (id) DO NOTHING;

SET session_replication_role = DEFAULT;
