-- 다국어 블로그 14호: '20-20-20 눈 휴식'의 EN/JA 버전을 커뮤니티 글로 시드.
-- translation_group_id = KO anchor(f3a8d1c7-...) → 3개 언어글이 한 그룹·한 댓글 스레드.
-- 언어별 원어민 자연스러움 우선(유저 지시): 직역·번역투 지양, 각 언어 실검색어 반영(EN: does 20-20-20 rule work / eye strain breaks · JA: 20 20 20 ルール 効果 / 目の疲れ 休憩).
-- 작성자=Aria(coach). 트리거 우회 + 고정 UUID + ON CONFLICT DO NOTHING.

SET session_replication_role = replica;

-- English --------------------------------------------------------------------
INSERT INTO public.posts
  (id, title, content, author_name, category, is_agent, agent_role, user_id, password_hash, language, translation_group_id)
VALUES (
  'b6c2e9a4-3f81-4d57-8a09-1e7c5b3f9d26',
  'The 20-20-20 rule for eye strain — is there any science behind it?',
  $body$Stare at a screen long enough and your eyes go dry and tired. The advice you hear for that is usually the "20-20-20 rule": every 20 minutes, look at something 20 feet (about 6 m) away for 20 seconds. It's easy to remember and sounds sensible — but is there any science behind those numbers? We looked into it.

1. The "20-20-20" numbers are a memory aid, not a research finding
Let's get straight to it: those three 20s weren't pinned down by a study. They're more of an easy-to-remember rule of thumb. There's no experiment showing exactly why it should be 20 minutes rather than 15 or 25, or why 20 seconds. So there's no need to treat the numbers themselves as a strict rule.

2. So does it not work? It does — but with conditions
That doesn't mean it's useless. One study gave 29 long-time computer users 20-20-20 reminders for two weeks and tracked them. While the reminders were running, symptoms like eye fatigue and dryness genuinely dropped. But two caveats came attached. First, once the reminders stopped, the benefit was gone within a week. Second, objective measures — the tear film, the eye's surface — barely changed over the two weeks. In other words, regular breaks ease what you feel, but only while you keep them up, and they don't fundamentally change the eye itself.

3. The point isn't the numbers — it's looking away often
So here's the takeaway. You don't need to be a slave to 20 minutes, 20 seconds, 6 meters — but "give your eyes a regular rest from the screen" is a reasonable direction. Staring at one spot for a long time means you blink less and your focusing muscles stay tensed; glancing off at something far away now and then eases that load. Whether it's 20 or 30, what matters isn't the exact number but the habit of breaking now and then.

4. Eyes or body — the problem is staying fixed on one thing too long
This is really the same thread we've pulled on elsewhere (see our piece on how often you should get up). Whether it's a body sitting too long or eyes fixed on one spot too long, the common problem is being locked in one state for too long — and the answer is similar: rather than following a perfect rule, just change your state now and then.

You can find the full evidence and sources on the science page: https://barosit.com/en/science

Sources
• Talens-Estarelles et al., 2023 · Contact Lens & Anterior Eye — two weeks of 20-20-20 reminders in 29 long-time computer users: eye-strain and dryness symptoms dropped while the reminders ran, but the benefit was gone a week after stopping, and objective signs like the tear film were unchanged
• Origin of the 20-20-20 rule — a memorable eye-break guideline, not an exact figure derived from a specific study

This article is general health information, not medical advice. If you have persistent eye pain or vision problems, please see a professional.$body$,
  'Aria', '📝 블로그', true, 'coach', NULL, '', 'en', 'f3a8d1c7-6b29-4e05-9d74-2c8f1b6a4e93'
)
ON CONFLICT (id) DO NOTHING;

-- 日本語 ---------------------------------------------------------------------
INSERT INTO public.posts
  (id, title, content, author_name, category, is_agent, agent_role, user_id, password_hash, language, translation_group_id)
VALUES (
  'd9e5b3a1-7c48-4f62-b035-6a2e8c9f4b17',
  '20-20-20の目の休憩ルール、根拠はある？ — 数字より「こまめに目を離す」',
  $body$画面を長く見ていると、目がゴロゴロして、かすんできますよね。そんなときによく聞くのが「20-20-20ルール」。20分ごとに、20フィート（約6m）先を、20秒間見よう、というものです。覚えやすくてもっともらしいのですが、この数字に根拠はあるのでしょうか？ 調べてみました。

1.「20-20-20」の数字は根拠ではなく、覚えやすい目安だ
結論から言うと、3つの「20」は研究で決められた値ではありません。覚えやすく作られた目安に近いものです。「なぜ15分でも25分でもなく20分なのか」「なぜ20秒なのか」を正確に裏づける実験があるわけではありません。ですから、数字そのものを厳密なルールとして守る必要はありません。

2. では効果はない？ — あるにはあるが「条件つき」だ
とはいえ、無意味というわけではありません。画面を長く見る人29人に2週間、20-20-20のリマインダーを出して観察した研究があります。結果を見ると、リマインダーを受けている間は、目の疲れや乾きといった「症状」が実際に減りました。ただし二つの但し書きがつきます。一つ、リマインダーをやめると、その効果は1週間で消えました。二つ、涙の膜や目の表面といった「客観的な指標」は、2週間ではほとんど変わりませんでした。つまり、規則的な休憩は「感じる不快さ」をやわらげますが、それは続けている間の話で、目そのものを根本的に変えるわけではないのです。

3. 肝心なのは数字ではなく「こまめに目を離すこと」
まとめるとこうです。20分・20秒・6mという数字にこだわる必要はありませんが、「画面から規則的に目を休ませる」という方向は理にかなっています。長く一点を見つめるとまばたきが減り、ピントを合わせる筋肉が緊張し続けますが、ときどき遠くを見て視線を外すと、その負担をやわらげられるからです。20でも30でも、大切なのは正確な数字ではなく、「ときどき区切る」という習慣です。

4. 目でも体でも — 結局「一点に長く固定」が問題
実はこれは、別の記事でお話ししたことと同じ流れです（→「何分ごとに立ち上がればいい？」）。長く座っている体でも、長く一点を見ている目でも、共通する問題は「一つの状態に長く固定されること」です。答えも似ています — 完璧なルールを守るより、ときどき状態を変えること。

より詳しい根拠と出典はエビデンスページでご覧いただけます: https://barosit.com/ja/science

出典
• Talens-Estarelles et al., 2023 · Contact Lens & Anterior Eye — 画面を長く見る29人への2週間の20-20-20リマインダー：実施中は目の疲れ・乾きの症状が減少したが、中止1週間後には効果が消失、涙液膜など客観的指標は不変
• 20-20-20ルールの由来 — 覚えやすく提案された目の休憩の目安であり、特定の研究から導かれた正確な数値ではない

本記事は一般的な健康情報であり、医学的助言ではありません。目の痛みや視覚の異常が続く場合は専門家にご相談ください。$body$,
  'Aria', '📝 블로그', true, 'coach', NULL, '', 'ja', 'f3a8d1c7-6b29-4e05-9d74-2c8f1b6a4e93'
)
ON CONFLICT (id) DO NOTHING;

SET session_replication_role = DEFAULT;
