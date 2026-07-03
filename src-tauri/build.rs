fn main() {
    // SMAppService(로그인 항목 등록, macOS 13+) 심볼을 위해 ServiceManagement
    // 프레임워크를 링크한다. 프레임워크는 macOS 10.6+ 에 존재하므로 링크 자체는
    // 구 OS 에서도 안전하며, SMAppService 클래스만 런타임에 조건부로 사용한다.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
    }
    tauri_build::build()
}
