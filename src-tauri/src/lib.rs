mod llm;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostureAlertPayload {
    pub posture_type: String,
    pub duration_secs: u32,
    pub severity: String,
    pub coaching_message: Option<String>,
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
    let title = match payload.posture_type.as_str() {
        "forward_head" => "거북목 자세 감지",
        "chin_resting" => "턱 괴는 자세 감지",
        "shoulder_tilt" => "어깨 기울임 감지",
        "slouching" => "등 구부정한 자세 감지",
        _ => "자세 알림",
    };

    let body = payload.coaching_message.unwrap_or_else(|| {
        format!(
            "{}초 동안 자세가 흐트러졌어요. 잠시 자세를 바로잡아 보세요.",
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

#[tauri::command]
async fn generate_coaching_message(
    api_key: String,
    posture_type: String,
    duration_secs: u32,
    today_count_for_type: u32,
    hour: u32,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("API key not configured".into());
    }
    llm::generate_coaching_message(
        &api_key,
        llm::CoachingRequest {
            posture_type,
            duration_secs,
            today_count_for_type,
            hour,
        },
    )
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
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
        .setup(|app| {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            tray::setup_tray(app.handle())?;

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
            generate_coaching_message,
            open_browser,
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
