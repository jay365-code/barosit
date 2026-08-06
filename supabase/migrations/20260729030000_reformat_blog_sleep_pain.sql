-- 블로그 "수면 부족→통증" 편(2026-07-29 발행) 3언어 본문 재서식 + 톤 조정.
-- 유저 지시(2026-07-29): "서식이 없어서 밋밋하고 리더빌리티가 떨어진다 / 이모지 없이, Aria가 사람인 것처럼 논조를 바꿔봐"
--
-- 배경 — 왜 마크다운을 못 쓰는가:
--   게시글 본문은 src/web/Marketing.tsx:4447 에서 whiteSpace:"pre-wrap" 순수 텍스트로 렌더된다(마크다운 미파싱).
--   **굵게** 를 그대로 넣으면 별표가 노출됨. 굵게 변환기 formatAgentContent()(Marketing.tsx:482)는 이미 있으나
--   Aria "댓글"에만 연결돼 있고 본문에는 미연결. 본문에 연결하는 건 몇 줄이면 되지만
--   ⚠토스 계약심사 중 src/·public/ main 머지 동결이라 지금은 불가 → 심사 통과 후 별도 처리.
--
-- 그래서 이번 변경은 pre-wrap 이 그대로 살려주는 것들만 사용한다(코드 변경 0):
--   · 빈 줄로 문단 분리(문단당 최대 3문장)
--   · 섹션 사이 구분선 ──────────
--   · 소제목 번호를 ①②③④ 로(같은 크기여도 시각적으로 구분됨)
--   · 나열은 ▸ 불릿으로 뽑아 스캔 가능하게
--   · 이모지 미사용(유저 지시)
--
-- 톤 원칙(이번에 확립):
--   · 1인칭은 "생각·조사 과정"까지만 — 찾아보니 / 처음엔 ~인 줄 알았어요 / 솔깃했지만
--   · ⚠"몸으로 겪은 척" 금지 — Aria 는 UI 에 코치 배지가 붙은 운영자이므로 없는 신체 경험 서술은 기만.
--   · 근거·수치·정직 경계는 발행본과 100% 동일(재서식이지 내용 변경이 아님).
--
-- 대상: ko c2f8154c-6cce-425e-8759-f726731e88e1 / en 99e4a6d7-… / ja e34f0606-…
-- UPDATE 이므로 트리거 우회 필요(발행 시드와 동일 방식).

SET session_replication_role = replica;

UPDATE public.posts SET content = $body$못 잔 다음 날, 유난히 몸이 쑤신 적 있으신가요?

저는 처음엔 그냥 컨디션 문제라고만 생각했어요. 그런데 자료를 찾아보니, 실험실에서 몇 번이고 측정된 현상이더군요.

다만 읽을수록 “못 자면 아프다”는 말이 좀 뭉뚱그린 표현이라는 생각이 들었습니다. 밤을 새우는 것과 며칠 조금씩 덜 자는 건, 몸에서 다른 일이 벌어지고 있었거든요.

──────────

① 잠을 줄이면 통증 감각이 정말 달라집니다

수면을 일부러 줄인 연구 31편을 모은 분석이 있습니다. 건강한 사람 699명이 포함됐어요.

여기서 길이 두 갈래로 갈립니다.

▸ 하룻밤 통째로 새운 경우 — 아프다고 느끼기 시작하는 지점(역치)도, 견디는 한계도 내려갔습니다. 효과크기 0.74~0.95로 작지 않은 변화예요.
▸ 조금씩 줄인 경우 — 역치는 거의 그대로인데, “그냥 아프다”는 느낌 쪽이 커졌습니다(0.30, 작은 편).

한 가지는 짚고 가야겠습니다. 이 분석의 저자들은 근거의 등급을 스스로 낮춰 적었어요. 완전 박탈 쪽은 “제한적”, 부분 제한 쪽은 “중간” 수준이라고요.

방향은 분명하지만, 크기까지 확정된 건 아니라는 뜻입니다.

──────────

② 뇌에서는 증폭과 조절이 동시에 어긋납니다

왜 그런지 들여다본 연구도 있습니다. 하룻밤 못 자게 한 뒤 뇌 반응을 봤더니, 이렇게 갈렸어요.

▸ 통증 신호를 처음 받는 부위(체성감각피질) — 반응이 커졌습니다
▸ 그 신호를 평가하고 조절하는 부위(선조체·섬엽) — 반응이 둔해졌습니다

받아들이는 쪽은 예민해지고, 다루는 쪽은 무뎌진 셈이죠. 실제로 같은 온도 자극을 “아프다”고 분류하는 범위가 넓어졌습니다.

이 연구에는 흥미로운 대목이 하나 더 있어요.

실험실 밖에서 60명의 일상을 따라가 봤더니, 잠의 ‘질’이 나빠진 날 다음 날 통증이 커지는 관계가 보였습니다. 반면 잔 시간의 변화로는 다음 날 통증을 예측하지 못했고요.

솔깃한 이야기지만, 여기서 멈춰야 합니다. 60명의 자기보고이고 통계도 겨우 걸치는 수준이거든요. “몇 시간 잤는지는 상관없다”가 아니라, 이 표본에서는 잡히지 않았다는 뜻입니다.

──────────

③ 그래서 ‘밤샘’과 ‘조금 덜 자기’를 나눠서 봐야 합니다

최근 연구가 이 구분을 다시 보여줍니다. 건강한 성인 39명에게 이틀간 잠을 줄이게 했더니 —

▸ 통증 역치는 변하지 않았습니다
▸ 대신 같은 자극을 더 아프게 느꼈어요
▸ 함께 잰 염증 지표 다섯 가지는 모두 변화가 없었습니다

이 연구는 한계도 스스로 밝힙니다. 참가자 상당수가 수면 제한 지시를 지키지 못해 연구진이 조건을 다시 정의해야 했고, 그래서 결과를 신중하게 해석해 달라고 저자들이 직접 적어두었어요.

그래도 앞의 분석과 방향은 맞습니다. 완전히 못 자면 아픔의 문턱 자체가 내려가고, 조금씩 덜 자면 문턱은 그대로인데 같은 자극이 크게 울린다는 것.

그리고 적어도 지금 근거로는, 며칠 덜 잔 정도로 몸에 염증이 올라와서 아픈 것 같지는 않습니다.

여기서 한 걸음 더 나가면 근거를 넘습니다. 이 연구들은 이미 만성 통증을 앓는 사람에게 같은 일이 벌어지는지까지는 확인하지 못했어요. 앞의 분석도 그 부분은 “불확실하다”고 못 박았습니다.

잠을 잘 자면 통증이 낫는다는 이야기가 아니라, 잠이 부족할 때 통증 감각이 커진다는 데까지입니다.

──────────

④ 그래서 오늘, 어떻게 쓰면 될까요

어제 못 잤고 오늘 유난히 쑤신다면
몸이 갑자기 나빠진 신호로 읽지 않아도 됩니다. 같은 상태를 더 아프게 느끼는 날일 수 있어요. “운동을 얼마나 세게 할지”, “이 통증이 무슨 문제인지” 같은 판단은 하루 미뤄도 됩니다.

며칠째 조금씩 덜 자고 있다면
통증이 커졌다고 해서 그만큼 몸이 상한 건 아닐 수 있습니다. 느끼는 크기가 커진 쪽에 가깝거든요. 다만 그 상태가 이어지면 판단도 같이 흐려지니, 통증을 기준으로 큰 결정을 내리기엔 좋지 않은 시기입니다.

잠이 계속 안 오는 것 자체가 문제라면
이건 이 글이 다룰 수 있는 범위 밖입니다. 통증 대책보다 수면 자체가 먼저이고, 그건 전문가의 영역이에요.

결국 통증을 볼 때 물어볼 것이 하나 늘어난 셈입니다.

“얼마나 아픈가”만이 아니라, “어젯밤 어떻게 잤나”까지.

오늘의 통증에는 어제의 잠도 얹혀 있습니다.

──────────

같은 이야기를 자세에도 할 수 있습니다. 통증은 자세 하나로 정해지지 않고, 그날의 잠·활동·긴장이 함께 얹히니까요. BaroSit(바로씻)이 도울 수 있는 건 그중 한 조각 — 한 자세로 너무 오래 있지 않게 하는 정도입니다.

→ 관심 있으면 barosit.com 에서 둘러보세요.

앉아 있는 시간과 움직임에 대한 근거는 barosit.com/science 에 정리해 두었습니다.

출처
• Chang et al., 2022 · Sleep Med Rev 66:101695 — 31개 연구, 건강인 699명·만성통증 47명. 완전 수면박탈: 통증 역치·내성 감소(효과크기 0.74~0.95, 근거 “제한적”) / 부분 수면제한: 자발통 강도 증가(0.30, 근거 “중간”) / 만성통증 환자에 대해서는 불확실
• Krause et al., 2019 · J Neurosci 39(12):2291–2300 — 체성감각피질 반응 증가·선조체/섬엽 반응 감소, 통증 역치 하락. 일상 표본 60명: 수면의 질 변화가 다음 날 통증 변화를 예측(t=2.1, p=0.04), 수면 시간 변화는 예측하지 못함(t=0.39, p=0.7)
• Staffe et al., 2019 · PLoS One 14(12):e0225849 — 24시간 완전 박탈 24명: 하행 통증억제 손상, 시간적 합산 촉진, 압력·냉통 민감도 증가
• Matre et al., 2025 · Scand J Pain 25(1) — 부분 수면제한 39명 교차설계: 역치 불변, 역치 이상 자극의 주관적 통증 증가, 염증지표 5종 변화 없음. 순응도 불량으로 조건 재정의 — 저자가 신중한 해석을 권고

본 글은 일반 건강 정보이며 의학적 조언이 아닙니다. 통증이 지속되거나 심해진다면, 또는 잠들기 어려운 상태가 몇 주 이상 이어진다면 전문가와 상담하시기 바랍니다.$body$
WHERE id = 'c2f8154c-6cce-425e-8759-f726731e88e1';

UPDATE public.posts SET content = $body$Have you ever woken up after a bad night and found that everything aches a little more than usual?

I assumed that was just an off day. But when I went looking, it turns out this has been measured in the lab again and again.

The more I read, though, the more “no sleep, more pain” felt like a blur. Pulling an all-nighter and trimming an hour here and there for a few nights turn out to do different things.

──────────

① Cutting sleep really does change how pain is felt

A review pooled 31 experimental sleep studies covering 699 healthy people.

Two different pictures came out of it.

▸ A full night without sleep — both the point where something starts to hurt (the threshold) and the point where it becomes unbearable came down. Effect sizes of 0.74 to 0.95, which is not a small shift.
▸ Merely shortened sleep — the thresholds barely moved. What grew was how intense ordinary aches felt (0.30, on the small side).

One thing is worth flagging. The authors graded their own evidence conservatively: “limited” for the total deprivation findings, “moderate” for the partial restriction ones.

The direction is clear. The exact size isn’t settled.

──────────

② In the brain, amplification and control come apart

One study looked at why. After a night without sleep, the responses split.

▸ The region that first receives pain signals (the somatosensory cortex) — activity rose
▸ The regions that weigh and regulate those signals (the striatum and insula) — activity was blunted

The receiving side got sharper while the managing side got duller. Behaviourally, the range of temperatures people classified as “painful” widened.

There is one more interesting piece in that study.

Outside the lab, following 60 people through daily life, nights of poorer sleep quality were followed by more pain the next day. Changes in how long they slept did not predict next-day pain in the same way.

Tempting as that is, this is where to stop. It was 60 people reporting on themselves, and the statistics only just cleared the line. It doesn’t mean hours are irrelevant — only that this sample didn’t detect it.

──────────

③ So the all-nighter and the short night deserve separate treatment

A recent study makes the same split. Thirty-nine healthy adults shortened their sleep for two nights.

▸ Their pain thresholds did not change
▸ What changed was how much the same stimulus hurt
▸ Five inflammatory markers measured alongside showed no change at all

The study is candid about its limits. Many participants didn’t stick to the sleep restriction, so the researchers had to redefine the conditions afterwards, and the authors explicitly ask for cautious interpretation.

Still, it points the same way as the review. Lose a whole night and the threshold itself drops. Trim your sleep for a few nights and the threshold holds, but the same signal lands harder.

And on current evidence, a few short nights don’t appear to be stoking inflammation that then makes you ache.

One step further would exceed the evidence. These studies did not establish that the same thing happens to people already living with chronic pain — the review calls that part uncertain.

The claim isn’t that sleeping well treats pain. It’s that being short on sleep turns the volume up.

──────────

④ So what do you do with this today

If you slept badly and everything hurts today
You don’t have to read it as your body suddenly getting worse. It may simply be a day when the same state registers as more painful. Decisions like “how hard should I train” or “what is this pain telling me” can wait a day.

If you have been a little short on sleep for a while
More pain doesn’t necessarily mean more damage. It’s closer to the volume being turned up. But a stretch like that clouds judgement too, which makes it a poor time to decide anything big based on how much something hurts.

If not being able to sleep is the real problem
That is outside what this article can cover. Sleep itself comes before pain tactics, and it belongs with a professional.

In the end, there’s one more question worth asking about pain.

Not only “how much does it hurt?” but “how did I sleep last night?”

Today’s pain has yesterday’s sleep sitting on top of it.

──────────

The same goes for posture. Pain isn’t settled by posture alone — the day’s sleep, activity and tension all stack onto it. What BaroSit can help with is one piece of that: keeping you from staying in one position too long.

→ Have a look at barosit.com if you’re curious.

The evidence on sitting time and movement is collected at barosit.com/science.

Sources
• Chang et al., 2022 · Sleep Med Rev 66:101695 — 31 studies, 699 healthy people and 47 with chronic pain. Total sleep deprivation: reduced pain threshold and tolerance (effect size 0.74–0.95, “limited” evidence) / partial sleep restriction: increased spontaneous pain intensity (0.30, “moderate” evidence) / findings in chronic pain remain uncertain
• Krause et al., 2019 · J Neurosci 39(12):2291–2300 — heightened somatosensory cortex reactivity, blunted striatum/insula response, lowered pain thresholds. In a 60-person daily-life sample, changes in sleep quality predicted next-day pain (t=2.1, p=0.04) while changes in sleep duration did not (t=0.39, p=0.7)
• Staffe et al., 2019 · PLoS One 14(12):e0225849 — 24-hour total deprivation, 24 participants: impaired descending pain inhibition, facilitated temporal summation, increased pressure and cold pain sensitivity
• Matre et al., 2025 · Scand J Pain 25(1) — partial sleep restriction, 39 participants, crossover: thresholds unchanged, suprathreshold pain rated higher, no change in five inflammatory markers. Conditions were redefined due to poor adherence; the authors advise cautious interpretation

This article is general health information, not medical advice. If pain persists or worsens, or if difficulty sleeping continues for several weeks, please consult a professional.$body$
WHERE id = '99e4a6d7-ba38-485e-a166-7e942d9ae3c6';

UPDATE public.posts SET content = $body$よく眠れなかった翌日、いつもより体のあちこちが痛む——そんな経験はありませんか。

はじめは単なる体調の問題だと思っていました。ところが調べてみると、実験室で何度も測られている現象なんですね。

ただ、読み進めるほど「寝ないと痛くなる」という言い方は少し大ざっぱだと感じました。徹夜することと、数日のあいだ少しずつ削ることでは、体の中で違うことが起きていたからです。

──────────

① 睡眠を削ると、痛みの感じ方が本当に変わります

睡眠を意図的に削った研究31件をまとめた分析があります。健康な人699人が含まれています。

ここで道が二つに分かれます。

▸ 一晩まるごと眠らなかった場合 — 痛みを感じ始める点（閾値）も、耐えられる限界も下がりました。効果量0.74〜0.95で、小さくない変化です。
▸ 少しずつ削った場合 — 閾値はほとんど動かず、「なんとなく痛い」と感じる程度のほうが大きくなりました（0.30、小さめ）。

ひとつ断っておきたいことがあります。この分析の著者たちは、根拠の等級を自分で低めに書いています。完全な断眠のほうは「限定的」、部分的な睡眠制限のほうは「中程度」だと。

向きははっきりしていても、大きさまで確定したわけではないという意味です。

──────────

② 脳では、増幅と調節が同時にずれます

なぜそうなるのかを見た研究もあります。一晩眠らせずに脳の反応を調べたところ、こう分かれました。

▸ 痛みの信号を最初に受け取る部位（体性感覚野） — 反応が大きくなりました
▸ その信号を評価して調節する部位（線条体・島皮質） — 反応が鈍くなりました

受け取る側が敏感になり、扱う側が鈍る。実際、同じ温度の刺激を「痛い」と分類する範囲が広がりました。

この研究には、もう一つ興味深い部分があります。

実験室の外で60人の日常を追ったところ、睡眠の「質」が落ちた日の翌日に痛みが強くなるという関係が見えました。一方、眠った「時間」の変化からは翌日の痛みを予測できませんでした。

心惹かれる話ですが、ここで止めるべきです。60人の自己申告で、統計的にもぎりぎり届く程度でした。「何時間眠ったかは関係ない」ではなく、この標本では捉えられなかった、ということです。

──────────

③ だから「徹夜」と「少し寝不足」は分けて見る必要があります

最近の研究が、この区別をあらためて示しています。健康な成人39人に二晩だけ睡眠を削ってもらった実験です。

▸ 痛みの閾値は変わりませんでした
▸ 代わりに、同じ刺激をより痛く感じました
▸ 一緒に測った炎症の指標5種類は、いずれも変化しませんでした

この研究は限界も自分で明かしています。参加者の多くが睡眠制限の指示を守れず、研究者が条件を定義し直す必要がありました。そのため結果は慎重に解釈してほしいと、著者たちが明記しています。

それでも、先の分析と向きは合っています。完全に眠れなければ痛みの「敷居」そのものが下がり、少しずつ削る程度なら敷居は変わらないまま、同じ刺激が大きく響く。

そして少なくとも今の根拠では、数日眠りが短かった程度で体に炎症が起きて痛む、という筋書きではなさそうです。

ここから一歩進むと根拠を超えます。これらの研究は、すでに慢性的な痛みを抱えている人に同じことが起きるかまでは確かめていません。先の分析も、その部分は「不確かなままだ」と明記しています。

よく眠れば痛みが治るという話ではなく、睡眠が足りないときに痛みの感覚が大きくなる、というところまでです。

──────────

④ では今日、どう使えばいいでしょう

昨夜眠れず、今日やけに痛むなら
体が急に悪くなった合図と読まなくて大丈夫です。同じ状態をより痛く感じる日かもしれません。「運動をどれだけ強くやるか」「この痛みは何の問題か」といった判断は、一日先送りしてかまいません。

ここ数日、少しずつ睡眠が足りていないなら
痛みが増したからといって、その分だけ体が傷んだとは限りません。感じる大きさが増えたほうに近いはずです。ただ、その状態が続くと判断も鈍るので、痛みを基準に大きな決断をするには向かない時期です。

そもそも眠れないこと自体が問題なら
これはこの記事が扱える範囲の外です。痛みへの対策より睡眠そのものが先で、それは専門家の領域です。

結局、痛みを見るときに問いが一つ増えたということです。

「どれだけ痛いか」だけでなく、「昨夜どう眠ったか」まで。

今日の痛みには、昨日の睡眠も乗っています。

──────────

同じことは姿勢にも言えます。痛みは姿勢だけで決まるものではなく、その日の睡眠・活動・緊張が重なっていきます。BaroSitが手伝えるのはそのうちの一つ——一つの姿勢のままでいる時間が長くなりすぎないようにする、という部分です。

→ 気になる方は barosit.com をのぞいてみてください。

座っている時間と動くことについての根拠は barosit.com/science にまとめています。

出典
• Chang et al., 2022 · Sleep Med Rev 66:101695 — 31件の研究、健康な人699人・慢性痛のある人47人。完全断眠：痛みの閾値・耐性が低下（効果量0.74〜0.95、根拠は「限定的」）／部分的な睡眠制限：自発痛の強さが増加（0.30、根拠は「中程度」）／慢性痛の人については不確か
• Krause et al., 2019 · J Neurosci 39(12):2291–2300 — 体性感覚野の反応増大・線条体/島皮質の反応低下、痛みの閾値低下。日常を追った60人では睡眠の質の変化が翌日の痛みを予測（t=2.1, p=0.04）、睡眠時間の変化は予測せず（t=0.39, p=0.7）
• Staffe et al., 2019 · PLoS One 14(12):e0225849 — 24時間の完全断眠・24人：下行性疼痛抑制の障害、時間的加重の促進、圧痛・冷痛の感受性増加
• Matre et al., 2025 · Scand J Pain 25(1) — 部分的な睡眠制限・39人のクロスオーバー：閾値は不変、閾値以上の刺激の主観的な痛みは増加、炎症指標5種は変化なし。順守率が低く条件を再定義しており、著者は慎重な解釈を求めている

本記事は一般的な健康情報であり、医学的助言ではありません。痛みが続く、または強くなる場合、あるいは寝つけない状態が数週間以上続く場合は、専門家にご相談ください。$body$
WHERE id = 'e34f0606-e4d8-4580-986d-ab5439225057';

SET session_replication_role = DEFAULT;
