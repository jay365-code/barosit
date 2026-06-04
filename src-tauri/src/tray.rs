use std::sync::Mutex;

use serde::Deserialize;
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

/// 트레이 메뉴/툴팁의 로컬라이즈 문자열. 프런트엔드(i18n)가 단일 진실원이며
/// set_tray_i18n 커맨드로 시작 시 + 언어 변경 시 이 값을 밀어넣는다.
/// Rust는 받은 문자열을 렌더만 한다. 기본값은 영어(프런트 push 전 잠깐 사용).
#[derive(Debug, Clone, Deserialize)]
pub struct TrayI18n {
    pub show: String,
    pub pause: String,
    pub resume: String,
    pub quit: String,
    pub tooltip_monitoring: String,
    pub tooltip_good: String,
    pub tooltip_warning: String,
    pub tooltip_bad: String,
    pub tooltip_paused: String,
    pub tooltip_resting: String,
}

impl Default for TrayI18n {
    fn default() -> Self {
        Self {
            show: "Open window".into(),
            pause: "Pause monitoring".into(),
            resume: "Resume monitoring".into(),
            quit: "Quit".into(),
            tooltip_monitoring: "BaroSit — Monitoring".into(),
            tooltip_good: "BaroSit · Sitting well".into(),
            tooltip_warning: "BaroSit · A little straighter".into(),
            tooltip_bad: "BaroSit · Straighten your shoulders".into(),
            tooltip_paused: "BaroSit · Resting".into(),
            tooltip_resting: "BaroSit · Leaning back to rest".into(),
        }
    }
}

/// Tauri managed state — 현재 트레이 로컬라이즈 문자열.
pub struct TrayI18nState(pub Mutex<TrayI18n>);

fn build_menu(app: &AppHandle, labels: &TrayI18n) -> tauri::Result<Menu<tauri::Wry>> {
    let show_item = MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", &labels.pause, true, None::<&str>)?;
    let resume_item = MenuItem::with_id(app, "resume", &labels.resume, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    Menu::with_items(app, &[&show_item, &pause_item, &resume_item, &quit_item])
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let (menu, monitoring_tip) = {
        let state = app.state::<TrayI18nState>();
        let labels = state.0.lock().unwrap();
        (build_menu(app, &labels)?, labels.tooltip_monitoring.clone())
    };

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon())
        .icon_as_template(true)
        .tooltip(&monitoring_tip)
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

/// 프런트가 언어별 트레이 문자열을 밀어넣을 때 호출 — 상태 갱신 + 메뉴 재생성.
/// 툴팁은 다음 update_tray_status 에서 현재 상태로 갱신되므로 여기선 monitoring 기본값으로.
pub fn apply_tray_i18n(app: &AppHandle, labels: TrayI18n) -> Result<(), String> {
    {
        let state = app.state::<TrayI18nState>();
        *state.0.lock().unwrap() = labels.clone();
    }
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "tray not found".to_string())?;
    let menu = build_menu(app, &labels).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(&labels.tooltip_monitoring))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_tray_status(app: &AppHandle, status: PostureStatus) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "tray not found".to_string())?;

    // 트레이엔 tooltip만 표시 — macOS 메뉴바 표준 룩(monochrome 아이콘 유지).
    // 컬러 이모지 title은 메뉴바와 시각이 안 맞아 제거. 호버 시 tooltip이 상태 알림.
    let tooltip = {
        let state = app.state::<TrayI18nState>();
        let labels = state.0.lock().unwrap();
        match status {
            PostureStatus::Good => labels.tooltip_good.clone(),
            PostureStatus::Warning => labels.tooltip_warning.clone(),
            PostureStatus::Bad => labels.tooltip_bad.clone(),
            PostureStatus::Paused => labels.tooltip_paused.clone(),
            PostureStatus::Resting => labels.tooltip_resting.clone(),
        }
    };
    tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())?;
    // macOS title은 비워 둔다(컬러 이모지 제거)
    #[cfg(target_os = "macos")]
    tray.set_title(None::<String>).map_err(|e| e.to_string())?;
    Ok(())
}
