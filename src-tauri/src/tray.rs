use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::PostureStatus;

/// 의자 실루엣 monochrome 트레이 아이콘 — macOS template image로 자동 라이트/다크 적응.
/// 빌드 시점에 PNG가 바이너리에 포함됨.
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/tray-icon@2x.png");

fn tray_icon() -> Image<'static> {
    Image::from_bytes(TRAY_ICON_PNG).expect("tray-icon@2x.png must be valid")
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "창 열기", true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", "모니터링 일시정지", true, None::<&str>)?;
    let resume_item = MenuItem::with_id(app, "resume", "모니터링 재개", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_item, &pause_item, &resume_item, &quit_item],
    )?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon())
        .icon_as_template(true)
        .tooltip("BaroSit — 모니터링 중")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "pause" => {
                let _ = app.emit("monitoring:pause", ());
            }
            "resume" => {
                let _ = app.emit("monitoring:resume", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                // macOS에선 Dock 클릭이 RunEvent::Reopen으로 따로 처리되지만,
                // Windows/Linux엔 그런 이벤트가 없어 트레이 클릭이 같은 역할을
                // 한다. 양쪽에서 동일하게 emit해서 JS의 메인 모드 복귀 로직을
                // 공유.
                let _ = app.emit("main:reopened", ());
            }
        })
        .build(app)?;

    // macOS에서 template image 동작을 명시적으로 한 번 더 보장
    #[cfg(target_os = "macos")]
    let _ = tray.set_icon_as_template(true);
    let _ = tray; // suppress unused on non-macos

    Ok(())
}

pub fn update_tray_status(app: &AppHandle, status: PostureStatus) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "tray not found".to_string())?;

    // 트레이엔 tooltip만 표시 — macOS 메뉴바 표준 룩(monochrome 아이콘 유지).
    // 컬러 이모지 title은 메뉴바와 시각이 안 맞아 제거. 호버 시 tooltip이 상태 알림.
    let tooltip = match status {
        PostureStatus::Good => "BaroSit · 잘 앉아 있어요",
        PostureStatus::Warning => "BaroSit · 조금만 더 바르게",
        PostureStatus::Bad => "BaroSit · 잠깐, 어깨를 펴볼까요",
        PostureStatus::Paused => "BaroSit · 쉬고 있어요",
        PostureStatus::Resting => "BaroSit · 잠깐 등받이에 기대 쉬는 중",
    };
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    // macOS title은 비워 둔다(컬러 이모지 제거)
    #[cfg(target_os = "macos")]
    tray.set_title(None::<String>).map_err(|e| e.to_string())?;
    Ok(())
}
