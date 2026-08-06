# Supabase Auth 메일 템플릿 (ko/en/ja)

Supabase 는 가입 확인·비밀번호 재설정 메일을 **자기 서버에서 자기 템플릿으로**
보낸다. 템플릿은 프로젝트당 1벌이고 발송 시점에 쓸 수 있는 변수는
`{{ .ConfirmationURL }}` `{{ .Token }}` `{{ .TokenHash }}` `{{ .SiteURL }}`
`{{ .Email }}` `{{ .Data }}` `{{ .RedirectTo }}` 뿐이다.

그래서 언어 분기는 템플릿 안에서 `{{ .Data }}`(= `user_metadata`)를 보고 한다.
`.Data.lang` 은 클라이언트가 넣는다:

- 가입 시 — `useAuth.signUpWithPassword` 의 `options.data.lang`
- 그 이후 — `src/lib/preferredLang.ts` 가 로그인·언어 변경 때 갱신(기존 사용자 백필)

값이 없으면 `else` 가지인 **한국어**로 나간다.

## 반영 방법 (수동)

이 파일들은 레포에 두는 사본이다. 실제 반영은 대시보드에서 붙여넣어야 한다:

Dashboard → Authentication → Emails → Templates → 해당 템플릿 →
Subject 와 Body(Source 탭)에 아래 파일 내용을 그대로 붙여넣고 Save.

| 파일 | 대시보드 템플릿 |
| --- | --- |
| `confirm-signup.subject.txt` / `confirm-signup.html` | Confirm sign up |
| `reset-password.subject.txt` / `reset-password.html` | Reset password |

수정할 때는 **레포 파일을 먼저 고치고** 대시보드에 붙여넣는다. 반대로 하면
대시보드 값만 바뀌어 다음 사람이 옛 사본을 붙여넣게 된다.

## 손대지 않은 템플릿

Invite user · Magic link or OTP · Change email address · Reauthentication 은
현재 앱에서 쓰지 않아 Supabase 기본(영문)을 그대로 뒀다. 쓰기 시작하면 같은
방식으로 3언어화할 것.
