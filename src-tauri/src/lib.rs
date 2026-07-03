// mod llm; // AI 코칭 폐기 — 정적 다국어 코칭으로 대체
mod tray;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_notification::NotificationExt;

/// 위젯 NSWindow 플래그 설정.
/// - 비활성 상태에서도 mouseMoved 수신 (호버용)
/// - window level 을 status (25) 로 올려 일반 floating 보다 위에 표시
/// - collection behavior 로 모든 Space + 풀스크린 앱 위에도 표시되도록 설정
///
/// 이전 NSPanel 변환 시도는 WebKit 의 NSTrackingArea 등록을 깨뜨려 호버 자체가
/// 안 잡히는 부작용이 있어 롤백. NSWindow 플래그만으로 처리.
#[cfg(target_os = "macos")]
fn configure_widget_window_for_hover(app: &AppHandle) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let Some(widget) = app.get_webview_window("widget") else {
        return;
    };
    let Ok(ns_ptr) = widget.ns_window() else {
        return;
    };
    let win = ns_ptr as *mut AnyObject;
    if win.is_null() {
        return;
    }
    // NSPopUpMenuWindowLevel = 101. NSStatusWindowLevel(25)·NSFloatingWindowLevel(3)
    // 보다 훨씬 높음. 풀스크린 앱이 자기 Space 에서 띄우는 windows 보다도 위에 표시.
    // (NSScreenSaverWindowLevel=1000 은 너무 높아 시스템 UI 가림 가능성 있어 회피.)
    const NS_POPUP_MENU_WINDOW_LEVEL: i64 = 101;
    // NSWindowCollectionBehaviorCanJoinAllSpaces(1<<0) | NSWindowCollectionBehaviorFullScreenAuxiliary(1<<8)
    // = 0x101 = 257. 모든 데스크탑에 표시 + 다른 앱이 풀스크린일 때도 위에 떠 있음.
    const NS_COLLECTION_ALL_SPACES_AUX: u64 = (1 << 0) | (1 << 8);
    unsafe {
        let _: () = msg_send![win, setAcceptsMouseMovedEvents: true];
        let _: () = msg_send![win, setIgnoresMouseEvents: false];
        let _: () = msg_send![win, setHidesOnDeactivate: false];
        let _: () = msg_send![win, setLevel: NS_POPUP_MENU_WINDOW_LEVEL];
        let _: () = msg_send![win, setCollectionBehavior: NS_COLLECTION_ALL_SPACES_AUX];
    }
}

/// 위젯 호버 폴링 — NSTrackingArea 가 key window 전용이라 비활성 상태에서 호버가
/// 안 잡히는 문제를 우회. cursor 의 글로벌 좌표를 위젯 frame 과 비교해 안에 있는지
/// 판단. 80ms 간격, 상태 전이 시에만 `widget:hover-changed` emit.
fn spawn_widget_hover_polling(app: &AppHandle) {
    use std::time::Duration;
    use tauri::EventTarget;
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut was_over = false;
        loop {
            tokio::time::sleep(Duration::from_millis(80)).await;

            let Some(widget) = app_handle.get_webview_window("widget") else {
                continue;
            };
            let visible = widget.is_visible().unwrap_or(false);
            if !visible {
                if was_over {
                    was_over = false;
                    let _ = app_handle.emit_to(
                        EventTarget::webview_window("widget"),
                        "widget:hover-changed",
                        false,
                    );
                }
                continue;
            }

            // Tauri 2 의 cursor_position() 은 글로벌 화면 좌표 반환.
            // widget 의 글로벌 위치(pos)와 크기(size)와 비교해 bounds 검사.
            let (Ok(cursor), Ok(pos), Ok(size)) = (
                widget.cursor_position(),
                widget.outer_position(),
                widget.outer_size(),
            ) else {
                continue;
            };
            let left = pos.x as f64;
            let top = pos.y as f64;
            let right = left + size.width as f64;
            let bottom = top + size.height as f64;
            let is_over =
                cursor.x >= left && cursor.x < right && cursor.y >= top && cursor.y < bottom;

            if is_over != was_over {
                was_over = is_over;
                let _ = app_handle.emit_to(
                    EventTarget::webview_window("widget"),
                    "widget:hover-changed",
                    is_over,
                );
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn configure_widget_window_for_hover(_app: &AppHandle) {}

/// App Nap 비활성화 — macOS 가 백그라운드 앱의 타이머/CPU를 강하게 throttle 시키는
/// 기능 때문에 메인 윈도우가 가려지면 pose loop 가 사실상 정지함. 비디오 통화·
/// DAW 등 연속 백그라운드 작업이 필요한 앱들이 사용하는 표준 우회법.
/// 반환된 activity 객체는 process 수명만큼 유지해야 효과가 지속되므로 의도적으로 leak.
#[cfg(target_os = "macos")]
fn disable_app_nap() {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    unsafe {
        let info_cls = objc2::class!(NSProcessInfo);
        let info: *mut AnyObject = msg_send![info_cls, processInfo];
        if info.is_null() {
            return;
        }

        let nsstring_cls = objc2::class!(NSString);
        let reason_bytes = b"BaroSit continuous posture monitoring\0";
        let reason_ptr = reason_bytes.as_ptr() as *const i8;
        let reason: *mut AnyObject =
            msg_send![nsstring_cls, stringWithUTF8String: reason_ptr];
        if reason.is_null() {
            return;
        }

        // NSActivityUserInitiated(0x00FFFFFF) — App Nap 비활성, 일반 user-facing 활동
        // | NSActivityLatencyCritical(0xFF00000000) — 타이머 coalescing 비활성
        // 두 플래그 합산: 백그라운드에서도 메인 스레드 타이머/렌더링 거의 throttle 없음.
        const NS_ACTIVITY_USER_INITIATED: u64 = 0x00FF_FFFF;
        const NS_ACTIVITY_LATENCY_CRITICAL: u64 = 0xFF_0000_0000;
        // [배터리] NSActivityIdleSystemSleepDisabled(1<<20) 비트를 제거 →
        // NSActivityUserInitiatedAllowingIdleSystemSleep 와 동등. App Nap 억제(백그라운드
        // pose loop throttle 방지)는 그대로 유지하되, 시스템이 유휴 시 잠들 수 있게 한다.
        // 기존 UserInitiated 는 이 비트를 포함해 프로세스 수명 내내 유휴 슬립을 막아
        // (pmset: "BaroSit continuous posture monitoring") 배터리 누수를 유발했음.
        const NS_ACTIVITY_IDLE_SYSTEM_SLEEP_DISABLED: u64 = 0x0010_0000;
        let options: u64 = (NS_ACTIVITY_USER_INITIATED
            & !NS_ACTIVITY_IDLE_SYSTEM_SLEEP_DISABLED)
            | NS_ACTIVITY_LATENCY_CRITICAL;

        let activity: *mut AnyObject =
            msg_send![info, beginActivityWithOptions: options, reason: reason];
        if activity.is_null() {
            return;
        }
        // 반환된 activity 는 autoreleased — retain 안 하면 다음 autorelease pool drain 시
        // 해제되어 App Nap 이 다시 작동. 한 번 retain 해서 process 수명까지 유지.
        let _: *mut AnyObject = msg_send![activity, retain];
        // 의도적으로 활동 핸들을 leak — 앱이 종료될 때까지 유지되어야 함.
    }
}

#[cfg(not(target_os = "macos"))]
fn disable_app_nap() {}

/// OS 전역 입력 유휴 시간(초) — 마지막 키보드/마우스 입력 이후 경과. 포커스된 앱과
/// 무관하게 시스템 전체 기준이라 "사용자가 작업 중인가"의 신뢰 가능한 신호다.
/// JS 가 폴링해 자리비움(+얼굴 없음) 지속 시 카메라를 끄고(배터리 보호 허용),
/// 입력이 다시 들어오면(=작업 재개) 카메라를 켜 모니터링을 재개한다.
#[cfg(target_os = "macos")]
#[tauri::command]
fn system_idle_secs() -> f64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        // double CGEventSourceSecondsSinceLastEventType(CGEventSourceStateID, CGEventType)
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
    }
    // kCGEventSourceStateHIDSystemState = 1, kCGAnyInputEventType = 0xFFFFFFFF
    unsafe { CGEventSourceSecondsSinceLastEventType(1, 0xFFFF_FFFF) }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn system_idle_secs() -> f64 {
    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(plii: *mut LastInputInfo) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount() -> u32;
    }
    unsafe {
        let mut info = LastInputInfo {
            cb_size: core::mem::size_of::<LastInputInfo>() as u32,
            dw_time: 0,
        };
        if GetLastInputInfo(&mut info) == 0 {
            return 0.0;
        }
        // dwTime 은 GetTickCount(ms) 단위 — 마지막 입력 시각. 경과 = now - dwTime.
        // GetTickCount 는 ~49.7일마다 wrap 하므로 wrapping_sub 으로 안전 처리.
        let idle_ms = GetTickCount().wrapping_sub(info.dw_time);
        f64::from(idle_ms) / 1000.0
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
fn system_idle_secs() -> f64 {
    0.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostureAlertPayload {
    pub posture_type: String,
    pub duration_secs: u32,
    pub severity: String,
    pub coaching_message: Option<String>,
    /// OS 알림 제목 — 프런트(i18n)에서 로컬라이즈해 전달. 없으면 기본 영어.
    #[serde(default)]
    pub title: Option<String>,
    /// coaching_message 가 없을 때 사용할 로컬라이즈 폴백 본문.
    #[serde(default)]
    pub body_fallback: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostureStatus {
    Good,
    Warning,
    Bad,
    Paused,
    Resting,
}

#[tauri::command]
fn show_posture_alert(app: AppHandle, payload: PostureAlertPayload) -> Result<(), String> {
    // 제목/본문 모두 프런트(i18n)에서 로컬라이즈해 전달. Rust는 렌더만.
    let title = payload
        .title
        .clone()
        .unwrap_or_else(|| "Posture alert".to_string());

    let body = payload
        .coaching_message
        .clone()
        .or_else(|| payload.body_fallback.clone())
        .unwrap_or_else(|| {
            format!(
                "Poor posture for {}s. Take a moment to straighten up.",
                payload.duration_secs
            )
        });

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_tray_i18n(app: AppHandle, labels: tray::TrayI18n) -> Result<(), String> {
    tray::apply_tray_i18n(&app, labels)
}

#[tauri::command]
fn update_status(app: AppHandle, status: PostureStatus) -> Result<(), String> {
    tray::update_tray_status(&app, status).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        if let Ok(true) = window.is_minimized() {
            window.unminimize().map_err(|e| e.to_string())?;
        }
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_widget_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("widget") {
        if visible {
            window.show().map_err(|e| e.to_string())?;
            // 윈도우가 새로 만들어졌거나 처음 보일 때 NSWindow 플래그가
            // 초기화돼 있을 수 있어 매번 다시 설정 — 안전한 idempotent 호출.
            configure_widget_window_for_hover(&app);
        } else {
            window.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 위반 알림용 풀스크린 오버레이 윈도우 표시 — 항상 최상위 + 마우스 클릭 통과.
/// 다른 앱 위에 잠깐 떠서 사용자가 인지하게 하고 자동 hide.
#[tauri::command]
fn show_alert_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("alert") {
        // 현재 윈도우가 있는 모니터의 풀스크린 영역으로 리사이즈
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let pos = monitor.position();
            let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
            let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
        }
        // 클릭 통과 — 알림이 떠 있어도 사용자가 그 아래의 다른 앱을 클릭 가능
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_always_on_top(true);
    }
    Ok(())
}

#[tauri::command]
fn hide_alert_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("alert") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// AI(LLM) 코칭은 정적 다국어 코칭으로 대체되어 폐기됨. (llm.rs 모듈 미사용)

// ─── OAuth loopback 콜백 폴백 서버 (RFC 8252 §7.3) ──────────────────────
//
// Windows MSIX(스토어) 설치본에서 barosit:// 딥링크 활성화가 실패하는 케이스
// 확인 (2026-06 스토어 인증 거부 10.1.2.10 — 테스터 스크린샷상 브리지 페이지
// 도달 후 앱이 안 열림). 폴백 경로:
//   1. 로그인 시작 시 JS 가 start_auth_loopback 호출 → 127.0.0.1 임시 포트
//      listen, 포트를 브리지 URL 의 ?port= 로 전달.
//   2. 브리지 페이지가 딥링크 시도 후에도 남아 있으면
//      http://127.0.0.1:<port>/auth-callback?code=... 로 *최상위 네비게이션*.
//      (fetch 가 아닌 이유: Safari 는 HTTPS 페이지의 http://127.0.0.1 fetch 를
//      mixed content 로 차단하지만 최상위 네비게이션은 허용.)
//   3. 서버가 query 를 기존 `barosit:deep-link` 이벤트로 emit → JS useAuth 의
//      custom listener 가 딥링크와 완전히 동일한 경로로 PKCE exchange.
//
// 보안: 127.0.0.1 에만 bind — LAN 미노출 + macOS 방화벽 프롬프트 회피.
// code 는 일회성이고 PKCE verifier 가 앱 webview localStorage 에만 있으므로
// 로컬의 다른 프로세스가 code 를 엿봐도 세션 교환은 불가.

struct AuthLoopback {
    port: u16,
    shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Default)]
struct AuthLoopbackState(std::sync::Mutex<Option<AuthLoopback>>);

fn shutdown_loopback(lb: &AuthLoopback) {
    lb.shutdown.store(true, std::sync::atomic::Ordering::SeqCst);
    // accept() 블로킹을 깨우기 위한 self-connect. 실패해도 무방 — 다음 연결
    // 도착 시점에 flag 를 보고 종료한다.
    let _ = std::net::TcpStream::connect(("127.0.0.1", lb.port));
}

const LOOPBACK_OK_HTML: &str = "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>BaroSit</title></head><body style=\"margin:0;height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;background:#0f1113;color:#e6ebf0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',system-ui,sans-serif;line-height:1.55\"><div style=\"max-width:420px;padding:32px 28px\"><h1 style=\"font-size:18px;margin:0 0 8px\">로그인 정보가 BaroSit 앱으로 전달되었습니다</h1><p style=\"font-size:14px;color:#aab3bd;margin:8px 0 0\">이 창을 닫고 앱으로 돌아가세요.<br>Sign-in was forwarded to the BaroSit app — you can close this window.</p></div></body></html>";

const LOOPBACK_NOT_FOUND_HTML: &str = "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>BaroSit</title></head><body></body></html>";

fn handle_loopback_request(mut stream: std::net::TcpStream, app: &AppHandle) {
    use std::io::{Read, Write};
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(2)));
    // 요청 라인 ("GET /auth-callback?... HTTP/1.1") 만 필요 — 2KB 면 충분.
    let mut buf = [0u8; 2048];
    let n = stream.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);
    let path = req
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("");

    let (status, body) = match path.strip_prefix("/auth-callback") {
        Some(query) => {
            let query = query.trim_start_matches('?');
            if query.is_empty() {
                ("400 Bad Request", LOOPBACK_NOT_FOUND_HTML)
            } else {
                let url = format!("barosit://auth-callback?{}", query);
                eprintln!("[auth-loopback] callback received — forwarding to webview");
                let _ = app.emit("barosit:deep-link", url);
                ("200 OK", LOOPBACK_OK_HTML)
            }
        }
        // favicon.ico 등 — 본문 없이 종료.
        None => ("404 Not Found", LOOPBACK_NOT_FOUND_HTML),
    };

    let resp = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
}

#[tauri::command]
fn start_auth_loopback(
    app: AppHandle,
    state: tauri::State<AuthLoopbackState>,
) -> Result<u16, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    // 이전 시도의 서버가 남아 있으면 교체 — 로그인 시도마다 fresh 포트.
    if let Some(prev) = guard.take() {
        shutdown_loopback(&prev);
    }
    let listener =
        std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let shutdown = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let thread_shutdown = shutdown.clone();
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            if thread_shutdown.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }
            let Ok(stream) = conn else { break };
            handle_loopback_request(stream, &app);
        }
        eprintln!("[auth-loopback] server on port {} stopped", port);
    });
    eprintln!("[auth-loopback] listening on 127.0.0.1:{}", port);
    *guard = Some(AuthLoopback { port, shutdown });
    Ok(port)
}

#[tauri::command]
fn stop_auth_loopback(port: u16, state: tauri::State<AuthLoopbackState>) {
    let Ok(mut guard) = state.0.lock() else { return };
    // 포트가 일치할 때만 종료 — JS 의 지연 stop(유예 10초) 이 그 사이 시작된
    // *새* 로그인 시도의 서버를 죽이지 않도록 가드.
    if guard.as_ref().map(|lb| lb.port) == Some(port) {
        if let Some(lb) = guard.take() {
            shutdown_loopback(&lb);
        }
    }
}

/// macOS 자동시작(로그인 항목)을 SMAppService(macOS 13+)로 등록/해제한다.
///
/// 기존 `tauri-plugin-autostart` 의 LaunchAgent 방식은 시스템 설정 > 일반 >
/// 로그인 항목 / 백그라운드 활동 목록에서 앱 이름이 아니라 코드서명 조직명
/// ("Gu B Deu Co., Ltd.") 으로 묶여 표시된다. SMAppService.mainApp 으로 등록하면
/// 번들 표시 이름("BaroSit")으로 나온다. SMAppService 클래스가 없는 macOS 12
/// 이하에서는 `None`/`Ok(false)` 로 폴백(플러그인 LaunchAgent) 을 알린다.
#[cfg(target_os = "macos")]
mod macos_login {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};
    use std::ffi::CStr;

    // SMAppServiceStatusEnabled = 1
    const SM_STATUS_ENABLED: isize = 1;

    /// `[SMAppService mainAppService]`. 클래스가 없으면(구 macOS) None.
    fn main_app_service() -> Option<*mut AnyObject> {
        let cls = AnyClass::get("SMAppService")?;
        unsafe {
            let svc: *mut AnyObject = msg_send![cls, mainAppService];
            (!svc.is_null()).then_some(svc)
        }
    }

    /// `Some(true/false)` = 지원됨(현재 등록 여부). `None` = SMAppService 미지원(구 macOS).
    pub fn is_enabled() -> Option<bool> {
        let svc = main_app_service()?;
        unsafe {
            let status: isize = msg_send![svc, status];
            Some(status == SM_STATUS_ENABLED)
        }
    }

    /// `Ok(true)` 등록/해제 성공, `Ok(false)` 미지원(폴백 필요), `Err` 실패(사유 포함).
    pub fn set(enabled: bool) -> Result<bool, String> {
        let Some(svc) = main_app_service() else {
            return Ok(false);
        };
        unsafe {
            let mut err: *mut AnyObject = std::ptr::null_mut();
            let err_ref: *mut *mut AnyObject = &mut err;
            let ok: bool = if enabled {
                msg_send![svc, registerAndReturnError: err_ref]
            } else {
                msg_send![svc, unregisterAndReturnError: err_ref]
            };
            if ok {
                Ok(true)
            } else {
                Err(error_message(err))
            }
        }
    }

    unsafe fn error_message(err: *mut AnyObject) -> String {
        if err.is_null() {
            return "SMAppService 작업 실패(원인 불명)".into();
        }
        let desc: *mut AnyObject = msg_send![err, localizedDescription];
        if desc.is_null() {
            return "SMAppService 작업 실패".into();
        }
        let utf8: *const std::os::raw::c_char = msg_send![desc, UTF8String];
        if utf8.is_null() {
            return "SMAppService 작업 실패".into();
        }
        CStr::from_ptr(utf8).to_string_lossy().into_owned()
    }

    /// 구 LaunchAgent plist(플러그인 방식) 를 제거해 SMAppService 와 중복 자동실행을
    /// 막는다. plist 가 존재했으면(=이전에 자동시작을 켜 둔 사용자) `true`.
    pub fn remove_legacy_launch_agent() -> bool {
        let Some(home) = std::env::var_os("HOME") else {
            return false;
        };
        let path = std::path::Path::new(&home).join("Library/LaunchAgents/BaroSit.plist");
        if path.exists() {
            let _ = std::fs::remove_file(&path);
            true
        } else {
            false
        }
    }
}

/// 자동시작 활성 여부 조회. macOS 13+ 는 SMAppService, 그 외/구 macOS 는
/// autostart 플러그인(LaunchAgent·레지스트리 Run) 으로 폴백.
#[tauri::command]
fn autostart_is_enabled(app: AppHandle) -> Result<Option<bool>, String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(v) = macos_login::is_enabled() {
            return Ok(Some(v));
        }
    }
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
            .is_enabled()
            .map(Some)
            .map_err(|e| e.to_string())
    }
}

/// 자동시작 설정/해제. macOS 13+ 는 SMAppService, 그 외/구 macOS 는 플러그인 폴백.
#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        match macos_login::set(enabled) {
            Ok(true) => return Ok(()),
            Ok(false) => {} // 미지원(구 macOS) → 폴백
            Err(e) => return Err(e),
        }
    }
    {
        use tauri_plugin_autostart::ManagerExt;
        let mgr = app.autolaunch();
        let r = if enabled { mgr.enable() } else { mgr.disable() };
        r.map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // argv 는 Windows/Linux deep-link 포워딩(아래 cfg 블록)에서만 사용되고
            // macOS 에선 그 블록이 제외돼 미사용 → 경고. 이름은 유지하고 macOS 에서만
            // 명시적으로 "사용" 표시해 경고를 억제(런타임 no-op).
            #[cfg(target_os = "macos")]
            let _ = &argv;
            // 두 번째 인스턴스 실행 시도 시 — 첫 인스턴스의 메인 윈도우를 띄움
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            // Windows/Linux 의 deep-link 메커니즘: barosit://... 클릭 시 OS 가
            // 본 앱을 *새 프로세스* 로 launch 하면서 argv 에 URL 포함. single-
            // instance plugin 이 검출 후 이 콜백 호출하고 2nd 프로세스는 종료.
            // 그러나 *argv 의 deep-link URL 이 1st 인스턴스에 전달 안 됨* —
            // 이게 사용자가 본 Windows OAuth 실패의 root cause. 우리가 직접
            // 별도 이벤트(`barosit:deep-link`) 로 emit 하고, JS 측 useAuth 가
            // listen 해서 handler 호출하도록 통로 추가.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                for arg in argv.iter() {
                    if arg.starts_with("barosit://") {
                        eprintln!("[single-instance] forwarding deep-link to 1st instance: {}", arg);
                        let _ = app.emit("barosit:deep-link", arg.clone());
                    }
                }
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                let _ = app.emit("monitoring:toggle-pause", ());
            }
        }).build())
        // OAuth 콜백을 native 앱으로 직접 받기 위한 deep-link 플러그인.
        // tauri.conf.json 의 plugins."deep-link".desktop.schemes 에서 "barosit" 스킴 등록.
        // 외부 브라우저에서 barosit://auth-callback?code=... 가 호출되면 OS 가 본 앱으로 라우팅,
        // 플러그인이 JS 측 onOpenUrl 이벤트로 전달 → useAuth.ts 의 PKCE exchange 실행.
        .plugin(tauri_plugin_deep_link::init())
        // 외부 URL (OAuth provider 페이지) 을 사용자 기본 브라우저에서 여는 데 사용.
        .plugin(tauri_plugin_opener::init())
        .manage(tray::TrayI18nState(std::sync::Mutex::new(
            tray::TrayI18n::default(),
        )))
        .manage(AuthLoopbackState::default())
        .setup(|app| {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            tray::setup_tray(app.handle())?;

            // 자동시작 마이그레이션: 구버전은 플러그인 LaunchAgent 로 자동시작을
            // 등록해 로그인 항목 목록에 조직명("Gu B Deu Co., Ltd.")으로 떴다.
            // 이제 SMAppService(앱 이름 "BaroSit" 표시)로 전환한다. 기존 plist 가
            // 있으면 = 사용자가 자동시작을 켜 뒀던 것이므로, SMAppService 로 다시
            // 등록해 설정을 유지하고 구 plist 를 지워 중복 실행을 막는다.
            #[cfg(target_os = "macos")]
            if macos_login::remove_legacy_launch_agent() {
                let _ = macos_login::set(true);
            }

            // Windows / Linux 는 deep-link 스킴이 install 시점 (MSI/NSIS) 에 OS 에 등록되므로
            // 개발 빌드 (cargo dev) 에선 미등록 상태. 런타임에 register_all 로 보강해 dev 에서도
            // 스킴이 동작하도록 함. macOS 는 Info.plist 가 build 시 생성되어 자동 등록되므로 불필요.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();

                // 콜드 스타트 deep-link: 앱이 *처음 실행* 될 때 argv 의 URL 처리.
                // single-instance 콜백은 *2nd 인스턴스* 시도일 때만 발화하므로,
                // 1st 인스턴스 자체가 deep-link 로 launch 된 경우는 여기서 처리.
                // webview 가 마운트되어 listener 등록할 시간을 주기 위해 약간
                // 지연 후 emit.
                let args: Vec<String> = std::env::args().collect();
                let deep_links: Vec<String> = args
                    .iter()
                    .filter(|a| a.starts_with("barosit://"))
                    .cloned()
                    .collect();
                if !deep_links.is_empty() {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        for url in deep_links {
                            eprintln!("[setup] cold-start deep-link emit: {}", url);
                            let _ = handle.emit("barosit:deep-link", url);
                        }
                    });
                }
            }

            // 전역 단축키 등록 (Mac: Cmd + Option + P / Win/Linux: Ctrl + Alt + P)
            #[cfg(target_os = "macos")]
            let modifiers = tauri_plugin_global_shortcut::Modifiers::SUPER | tauri_plugin_global_shortcut::Modifiers::ALT;
            #[cfg(not(target_os = "macos"))]
            let modifiers = tauri_plugin_global_shortcut::Modifiers::CONTROL | tauri_plugin_global_shortcut::Modifiers::ALT;

            let shortcut = tauri_plugin_global_shortcut::Shortcut::new(Some(modifiers), tauri_plugin_global_shortcut::Code::KeyP);
            let _ = app.global_shortcut().register(shortcut);

            // App Nap 비활성화 — 메인 윈도우가 가려져도 pose loop 가 throttle 없이 동작.
            // process 수명 동안 유지되어야 효과 있음.
            disable_app_nap();
            // 위젯 NSWindow 호버 이벤트 설정 — 비활성 상태에서도 마우스 이벤트 수신
            configure_widget_window_for_hover(app.handle());
            // 커서 폴링 기반 호버 감지 — 키 윈도우 의존성 우회
            spawn_widget_hover_polling(app.handle());
            // alert 윈도우는 visible=false default지만 일부 macOS 버전에서 초기에 깜빡일 수
            // 있어 명시적으로 hide + click-through 보장
            if let Some(alert) = app.handle().get_webview_window("alert") {
                let _ = alert.hide();
                let _ = alert.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        // 메인 닫기 시 앱 완전 종료, 최소화 시 hide + JS 이벤트(위젯 모드로 자동 전환)
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    WindowEvent::CloseRequested { .. } => {
                        // 메인 창 닫기 버튼(X) 클릭 시 앱 프로세스 완전 종료
                        window.app_handle().exit(0);
                    }
                    WindowEvent::Resized(_) => {
                        if let Ok(true) = window.is_minimized() {
                            let _ = window.hide();
                            let _ = window.app_handle().emit("main:close-requested", ());
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            show_posture_alert,
            update_status,
            show_main_window,
            hide_main_window,
            set_widget_visible,
            show_alert_window,
            hide_alert_window,
            quit_app,
            set_tray_i18n,
            open_browser,
            system_idle_secs,
            start_auth_loopback,
            stop_auth_loopback,
            autostart_is_enabled,
            autostart_set,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // macOS만 dock 클릭으로 RunEvent::Reopen 발생. Windows는 트레이 클릭이
            // 같은 의미라 [tray.rs](tray.rs) 의 on_tray_icon_event 에서 동일 신호를 emit한다.
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = _event {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = _app.emit("main:reopened", ());
            }
        });
}
