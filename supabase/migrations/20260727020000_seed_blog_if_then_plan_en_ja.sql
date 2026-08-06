-- 블로그 en/ja 시드 — "계획의 형식"(실행 의도) 편. ko 원본 = d96ae241-6a6f-4495-b03b-e1d2d2289407.
-- translation_group_id 는 3개 언어 모두 ko UUID 로 통일(한 그룹·한 댓글 스레드).
--
-- 직역이 아니라 각 언어 원어민 문장으로 따로 작성(유저 지시 2026-07-08). 근거·수치·정직 경계는 ko 와 동일.
-- 제목은 언어별 실검색어 반영:
--   en: "intention behaviour gap" / "how to stick to a workout plan" / "if then plan"
--   ja: 「三日坊主」「習慣化 コツ」「運動 続かない」
-- 학술 용어(implementation intention / 実行意図)는 본문에서 사용하지 않고 "if-then" · 「もし〜なら」로 풀어씀.

SET session_replication_role = replica;

-- ── EN ──────────────────────────────────────────────────────────────────
INSERT INTO public.posts
  (id, title, content, author_name, category, is_agent, agent_role, user_id, password_hash, language, translation_group_id)
VALUES (
  '6dfe7753-d2cf-430e-8439-0c4815e8ad51',
  '46% of People Who Intend to Exercise Never Follow Through — What Changes It Is How You Write the Plan',
  $body$“I’ll start working out next month.” How many times has that actually turned into workouts? When it fizzles, we tend to blame willpower. Researchers who have studied this particular failure point somewhere else.

1. Nearly half of the people who mean to exercise don’t — and that number has been measured
There is an analysis pooling 10 studies with 3,899 adults. It singled out the people who had already decided to exercise, then checked whether they actually did it. Among those intenders, 46% never followed through. The authors concluded that intention on its own is a weaker predictor of behaviour than our models assume. Put differently: failing to act isn’t the exception, it’s close to half the room.

2. Adding more motivation did not close the gap
So would wanting it more help? A study of 248 people separated exactly that question. One group received an intervention designed to raise motivation — the risks of inactivity, the reasons to move. Another group got the same thing plus one extra instruction: write down when, where and how you will do it. The motivation-only group showed no meaningful increase in exercise. Behaviour changed only in the group that did both. It ran two weeks on self-report, so it is not a long study, but the direction is clear. What differed was not how much people wanted it. It was whether they had settled on where that wanting would switch on.

3. What made the difference was the format of the plan
The method is simpler than it sounds. Instead of a goal like “exercise more,” you write one line in the form “If (this situation), then (this action).”
• Get more exercise → When I take my shoes off after work, I change straight into workout clothes
• Drink more water → When a meeting ends, I fill a glass on the way back to my desk
An analysis pooling studies of this method reported d=.65 across 94 independent tests — a medium-to-large effect. A larger analysis published in 2024 pooled 642 tests and put the effect between .27 and .66, finding it was bigger when the plan used the if-then format, when people genuinely wanted the goal, and when they rehearsed the plan. Those figures average across many domains, so the effect is smaller when you look at physical activity on its own, though it points the same way. The point is not how badly you want it. It is deciding in advance what counts as the cue, and what you do when it arrives.

4. So how do you use this today
If you already have a plan and you keep it — leave it alone. If you change anything, check the shape of the sentence. If it reads as a frequency (“three workouts a week”), add the moment that will trigger it (“when I put my bag down after work”).
If you make plans but they keep collapsing — put the collapse itself into the plan. One condition that produced bigger effects in the analysis above was planning for the obstacle, not only for the behaviour. If “I can’t when I work late” keeps repeating, write the answer ahead of time: “If I’m still working past eight, I do ten minutes at home.”
If you have no plan at all — make one, not five. Attach it to the most reliably repeating moment of your day. If it doesn’t stick, make the situation more specific rather than adding more plans.
In the end, the useful question is less “how determined am I?” and more “where and when have I arranged for that to switch on?” The effect isn’t dramatic, but the cost is a single sentence, which makes it a reasonable trade.

None of these studies tested posture, or breaking up long stretches of sitting. But it is the same problem underneath — turning something you decided into something you do — so it is worth applying the same approach there. What BaroSit does sits on the cue side of it: telling you when one position has gone on too long. What you do with that signal is better decided in advance, in the way described above.
→ Have a look at barosit.com if you’re curious.

The evidence on sitting time and movement is collected at barosit.com/science.

Sources
• Rhodes & de Bruijn, 2013 · Br J Health Psychol 18(2):296–309 — 10 studies, N=3,899; intention–behaviour gap 46%
• Gollwitzer & Sheeran, 2006 · Adv Exp Soc Psychol 38:69–119 — 94 independent tests, d=.65
• Sheeran, Listrom & Gollwitzer, 2025 · Eur Rev Soc Psychol 36(1):162–194 — 642 tests, .27 ≤ d ≤ .66
• Bélanger-Gravel, Godin & Amireault, 2013 · Health Psychol Rev 7(1):23–54 — 26 physical-activity studies; 0.31 (95% CI 0.11–0.51) post-intervention, 0.24 (0.13–0.35) at follow-up
• Milne, Orbell & Sheeran, 2002 · Br J Health Psychol 7(2):163–184 — n=248

This article is general health information, not medical advice. If pain persists or worsens, please consult a professional.$body$,
  'Aria', '📝 블로그', true, 'coach', NULL, '', 'en', 'd96ae241-6a6f-4495-b03b-e1d2d2289407'
)
ON CONFLICT (id) DO NOTHING;

-- ── JA ──────────────────────────────────────────────────────────────────
INSERT INTO public.posts
  (id, title, content, author_name, category, is_agent, agent_role, user_id, password_hash, language, translation_group_id)
VALUES (
  '731c35cb-a1a0-4545-9d32-fbe865d05c99',
  '運動しようと決めた人の46%は実行していない — 差がついたのは「計画の書き方」だった',
  $body$「来月から運動しよう」——そう決めて、実際に続いたことは何回あるでしょうか。三日坊主で終わると、たいていは意志が弱いせいだと考えてしまいます。ただ、この失敗を長く調べてきた研究が指しているのは、別の場所です。

1. 決めた人の半分近くが実行していない——これは実際に測られた数字です
成人3,899人が参加した10件の研究をまとめた分析があります。運動すると決めた人だけを取り出して、その後で実際にやったかどうかを確かめたものです。結果は、決めた人のうち46%が実行に移せませんでした。研究者の結論は、意図だけで行動を説明しようとする枠組みは思ったより弱い、というものでした。つまり、決めたのにできない側は例外ではなく、半分近くを占める多数派だということです。

2. やる気をさらに高めるだけでは埋まりませんでした
では、もっと強く決意すればいいのでしょうか。248人を対象に、そこを直接分けて確かめた研究があります。一方には運動の必要性やリスクを伝えてやる気を高める働きかけをし、もう一方にはそれに加えて「いつ・どこで・どうやるか」を前もって書いてもらいました。やる気だけを高めたグループでは、その後の運動量に意味のある増加はありませんでした。行動がはっきり変わったのは、両方を行ったグループだけです。2週間の自己申告なので長期を見た研究ではありませんが、方向ははっきりしています。違いを生んだのは気持ちの大きさではなく、その気持ちが立ち上がる場所を決めてあったかどうかでした。

3. 差をつくったのは計画の「書き方」でした
研究で使われるやり方は、意外なほど単純です。「もっと運動する」といった目標の代わりに、「もし（この状況）になったら、（この行動）をする」という形で一行書く。それだけです。
• 運動しよう → 仕事から帰って玄関で靴を脱いだら、そのまま運動着に着替える
• 水を飲もう → 会議が終わったら、席に戻る途中で一杯飲む
この方法を扱った研究をまとめた分析は、94件の独立した検定で d=.65、中くらいから大きい効果を報告しています。2024年に出たより大きな分析は642件の検定をまとめ、効果の大きさを .27〜.66 の範囲に整理しました。しかも「もし〜なら」の形で書いたとき、その目標を本当に望んでいるとき、計画をもう一度思い返したときに、効果はより大きくなっています。これらは多くの領域を平均した数字なので、身体活動だけを取り出すとこれより小さくなりますが、向きは一貫しています。要点は決意の強さではなく、何を合図にして、その合図で何をするのかを前もって結びつけておくことです。

4. では、今日からどう使うか
すでに計画があってうまく続いているなら——変える必要はありません。手を入れるとしても、文の形だけ。「週3回運動」のように頻度だけで書かれているなら、それを立ち上げる場面（「帰宅してかばんを置いたら」）を一行前に足すだけで十分です。
立てるけれど崩れてしまうなら——崩れる場面のほうを計画に入れてみてください。先ほどの分析で効果が大きかった条件の一つが、行動だけでなく妨げへの対処まで計画に含めた場合でした。「残業すると無理」が繰り返されるなら、「残業で8時を過ぎたら、家で10分だけやる」と先に答えを書いておく形です。
まだ何の計画もないなら——いくつも作らず、一つだけ。一日のうちで最も確実に繰り返される場面に結びつけるほうが続きます。うまくいかないときは、計画を増やすより場面をもっと具体的にするほうです。
結局のところ問うべきなのは「どれだけ強く決めたか」よりも、「その気持ちが、いつ、どこで立ち上がるようにしてあるか」に近いはずです。効果は劇的ではありませんが、かかる手間が一行だと考えれば、試す価値のある取引だと思います。

これらの研究が、姿勢や長く座り続けることを直接試したわけではありません。ただ「決めたことを実際にやる」という問題は同じなので、同じやり方を姿勢に当てはめてみるのも意味のあることです。BaroSitがしているのも、結局はこの「合図」の側です。同じ姿勢が長く続いたときに知らせるところまでがアプリの役目で、その合図で何をするかは、上のように前もって決めておくほうがうまくいきます。
→ 気になる方は barosit.com をのぞいてみてください。

座っている時間と動くことについての根拠は barosit.com/science にまとめています。

出典
• Rhodes & de Bruijn, 2013 · Br J Health Psychol 18(2):296–309 — 10件の研究・N=3,899、意図と行動の差 46%
• Gollwitzer & Sheeran, 2006 · Adv Exp Soc Psychol 38:69–119 — 94件の独立した検定、d=.65
• Sheeran, Listrom & Gollwitzer, 2025 · Eur Rev Soc Psychol 36(1):162–194 — 642件の検定、.27 ≤ d ≤ .66
• Bélanger-Gravel, Godin & Amireault, 2013 · Health Psychol Rev 7(1):23–54 — 身体活動に絞った26件、介入直後 0.31（95% CI 0.11–0.51）／追跡時点 0.24（0.13–0.35）
• Milne, Orbell & Sheeran, 2002 · Br J Health Psychol 7(2):163–184 — n=248

本記事は一般的な健康情報であり、医学的助言ではありません。痛みが続く、または強くなる場合は専門家にご相談ください。$body$,
  'Aria', '📝 블로그', true, 'coach', NULL, '', 'ja', 'd96ae241-6a6f-4495-b03b-e1d2d2289407'
)
ON CONFLICT (id) DO NOTHING;

SET session_replication_role = DEFAULT;
