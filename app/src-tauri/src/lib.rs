#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, RunEvent, State};

const NODE_MIN_MAJOR: u32 = 22;
const NODE_MIN_MINOR: u32 = 13;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(10);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(200);
const SIDECAR_POLL_INTERVAL: Duration = Duration::from_millis(250);
const MAX_RESTARTS: u8 = 5;
// How long the sidecar gets to close its database after a polite terminate
// before it is killed outright. It normally closes in milliseconds.
const TERM_GRACE: Duration = Duration::from_millis(2000);
const TERM_POLL_INTERVAL: Duration = Duration::from_millis(25);

#[derive(Clone, Debug, Serialize)]
pub struct SidecarStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub error: Option<String>,
}

struct SidecarInner {
    state_dir: PathBuf,
    status: Mutex<SidecarStatus>,
    child: Mutex<Option<Child>>,
    shutdown: AtomicBool,
    supervisor: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone)]
pub struct SidecarManager {
    inner: Arc<SidecarInner>,
}

impl SidecarManager {
    fn new(state_dir: PathBuf) -> Self {
        let initial_error = fs::create_dir_all(&state_dir)
            .err()
            .map(|error| format!("Could not create state directory {}: {error}", state_dir.display()));

        Self {
            inner: Arc::new(SidecarInner {
                state_dir,
                status: Mutex::new(SidecarStatus {
                    running: false,
                    port: None,
                    error: initial_error,
                }),
                child: Mutex::new(None),
                shutdown: AtomicBool::new(false),
                supervisor: Mutex::new(None),
            }),
        }
    }

    fn state_dir(&self) -> &PathBuf {
        &self.inner.state_dir
    }

    fn status(&self) -> SidecarStatus {
        self.inner
            .status
            .lock()
            .expect("sidecar status mutex poisoned")
            .clone()
    }

    fn set_status(&self, status: SidecarStatus) {
        *self
            .inner
            .status
            .lock()
            .expect("sidecar status mutex poisoned") = status;
    }

    fn set_error(&self, error: impl Into<String>) {
        self.set_status(SidecarStatus {
            running: false,
            port: None,
            error: Some(error.into()),
        });
    }

    fn start<R: tauri::Runtime>(&self, app: &tauri::AppHandle<R>) {
        if self.status().error.is_some() {
            return;
        }

        if let Err(error) = check_node_version() {
            self.set_error(error);
            return;
        }

        let Some(script) = find_server_script(app) else {
            self.set_error(
                "The Sparring server was not found. Expected server/index.mjs in the application resources.",
            );
            return;
        };

        let mut supervisor = self
            .inner
            .supervisor
            .lock()
            .expect("supervisor mutex poisoned");
        if supervisor.is_some() {
            return;
        }

        let manager = self.clone();
        *supervisor = Some(
            thread::Builder::new()
                .name("sparring-sidecar-supervisor".to_string())
                .spawn(move || manager.supervise(script))
                .expect("could not start sidecar supervisor thread"),
        );
    }

    fn supervise(&self, script: PathBuf) {
        let mut restart_count = 0;

        loop {
            if self.inner.shutdown.load(Ordering::Acquire) {
                return;
            }

            self.set_status(SidecarStatus {
                running: false,
                port: None,
                error: None,
            });

            match self.spawn_sidecar(&script) {
                Ok(()) => {
                    if self.wait_for_healthy() {
                        self.set_status(SidecarStatus {
                            running: true,
                            port: self.read_port(),
                            error: None,
                        });

                        loop {
                            if self.inner.shutdown.load(Ordering::Acquire) {
                                self.stop_child();
                                return;
                            }

                            if let Some(exit) = self.take_exited_child() {
                                restart_count += 1;
                                let message = format_exit_message(
                                    "The server stopped unexpectedly",
                                    exit,
                                    restart_count,
                                );
                                self.set_error(message);
                                break;
                            }

                            thread::sleep(SIDECAR_POLL_INTERVAL);
                        }
                    } else {
                        restart_count += 1;
                        self.stop_child();
                        self.set_error(format!(
                            "The server did not answer /api/health within ten seconds; restart {restart_count} of {MAX_RESTARTS}."
                        ));
                    }
                }
                Err(error) => {
                    restart_count += 1;
                    self.set_error(error);
                }
            }

            if restart_count >= MAX_RESTARTS {
                self.set_error(format!(
                    "The server failed after {MAX_RESTARTS} restart attempts. Check {} for details.",
                    self.log_path().display()
                ));
                self.stop_child();
                return;
            }

            let backoff = Duration::from_millis(500 * 2_u64.pow(u32::from(restart_count - 1)));
            let deadline = Instant::now() + backoff.min(Duration::from_secs(8));
            while Instant::now() < deadline {
                if self.inner.shutdown.load(Ordering::Acquire) {
                    self.stop_child();
                    return;
                }
                thread::sleep(Duration::from_millis(100));
            }
        }
    }

    fn spawn_sidecar(&self, script: &PathBuf) -> Result<(), String> {
        fs::create_dir_all(self.state_dir()).map_err(|error| {
            format!("Could not create state directory {}: {error}", self.state_dir().display())
        })?;

        let port_path = self.state_dir().join("port");
        if let Err(error) = fs::remove_file(&port_path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(format!(
                    "Could not clear stale port file {}: {error}",
                    port_path.display()
                ));
            }
        }

        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.log_path())
            .map_err(|error| format!("Could not open sidecar log {}: {error}", self.log_path().display()))?;
        let log_copy = log
            .try_clone()
            .map_err(|error| format!("Could not prepare sidecar log: {error}"))?;

        let mut command = Command::new("node");
        command
            .arg(script)
            .env("SPARRING_HOME", self.state_dir())
            // The sidecar watches this pid and shuts itself down when it goes.
            // The handlers below cover every exit this process can observe; the
            // watchdog covers the ones it cannot, a crash or a SIGKILL.
            .env("SPARRING_PARENT_PID", std::process::id().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_copy))
            .stderr(Stdio::from(log));

        configure_process_group(&mut command);

        let child = command.spawn().map_err(|error| {
            format!("Could not start Node.js server: {error}. Check that node is on PATH.")
        })?;

        *self
            .inner
            .child
            .lock()
            .expect("child mutex poisoned") = Some(child);
        Ok(())
    }

    fn wait_for_healthy(&self) -> bool {
        let deadline = Instant::now() + HEALTH_TIMEOUT;

        while Instant::now() < deadline {
            if self.inner.shutdown.load(Ordering::Acquire) {
                self.stop_child();
                return false;
            }

            if self.has_exited_child() {
                return false;
            }

            if let Some(port) = self.read_port() {
                let token = read_token(self.state_dir()).ok();
                if health_request(port, token.as_deref()).is_ok() {
                    return true;
                }
            }

            thread::sleep(HEALTH_POLL_INTERVAL);
        }

        false
    }

    fn read_port(&self) -> Option<u16> {
        read_port(self.state_dir())
    }

    fn log_path(&self) -> PathBuf {
        self.state_dir().join("sidecar.log")
    }

    fn has_exited_child(&self) -> bool {
        let mut child = self.inner.child.lock().expect("child mutex poisoned");
        match child.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(Some(_))),
            None => true,
        }
    }

    fn take_exited_child(&self) -> Option<ExitStatus> {
        let mut child = self.inner.child.lock().expect("child mutex poisoned");
        let exited = child.as_mut()?.try_wait().ok().flatten();
        if exited.is_some() {
            child.take();
        }
        exited
    }

    fn stop_child(&self) {
        let Some(mut child) = self
            .inner
            .child
            .lock()
            .expect("child mutex poisoned")
            .take()
        else {
            return;
        };

        kill_process_tree(&mut child);
        let _ = child.wait();
        let _ = fs::remove_file(self.state_dir().join("port"));
    }

    fn shutdown(&self) {
        if self.inner.shutdown.swap(true, Ordering::AcqRel) {
            return;
        }

        self.stop_child();
        if let Some(supervisor) = self
            .inner
            .supervisor
            .lock()
            .expect("supervisor mutex poisoned")
            .take()
        {
            let _ = supervisor.join();
        }
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if Arc::strong_count(&self.inner) == 1 {
            self.shutdown();
        }
    }
}

#[tauri::command]
fn sidecar_status(state: State<'_, SidecarManager>) -> SidecarStatus {
    state.status()
}

#[tauri::command]
fn sidecar_token(state: State<'_, SidecarManager>) -> Result<String, String> {
    read_token(state.state_dir())
}

#[tauri::command]
fn state_dir(state: State<'_, SidecarManager>) -> String {
    state.state_dir().display().to_string()
}

#[tauri::command]
fn skill_resource_dir<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("skill"));
        candidates.push(resource_dir.join("resources/skill"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../skill"));
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skill"));

    candidates
        .into_iter()
        .find(|candidate| candidate.join("SKILL.md").is_file() && candidate.join("install.sh").is_file())
        .map(|candidate| candidate.display().to_string())
        .ok_or_else(|| "The bundled sparring skill was not found.".to_string())
}

/// Which window conventions this build is running under.
///
/// macOS puts the window controls on the left and expects them to be the real
/// ones, so on macOS the window keeps its decorations and the title bar is an
/// overlay: the native traffic lights sit over the interface's own top bar and
/// the glass runs to the edge behind them. Windows and Linux keep the frameless
/// window and the interface's own controls on the right, which is their
/// convention. The interface asks rather than sniffing the user agent.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChrome {
    pub platform: String,
    /// True when the system draws the window controls over the interface.
    pub overlay_title_bar: bool,
    /// True when the interface must draw its own minimise, maximise and close.
    pub draws_own_controls: bool,
}

#[tauri::command]
fn window_chrome() -> WindowChrome {
    let overlay = cfg!(target_os = "macos");
    WindowChrome {
        platform: std::env::consts::OS.to_string(),
        overlay_title_bar: overlay,
        draws_own_controls: !overlay,
    }
}

#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| error.to_string())
}

fn resolve_state_dir() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("SPARRING_HOME") {
        if !path.is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    let home = if cfg!(windows) {
        std::env::var_os("USERPROFILE")
    } else {
        std::env::var_os("HOME")
    }
    .ok_or_else(|| "Could not determine the home directory. Set SPARRING_HOME and try again.".to_string())?;

    Ok(PathBuf::from(home).join(".sparring"))
}

fn check_node_version() -> Result<(), String> {
    let output = Command::new("node")
        .arg("--version")
        .output()
        .map_err(|_| {
            "Node.js 22.13 or newer is required, but node was not found on PATH. Install Node.js 22.13 or newer from https://nodejs.org/en/download/.".to_string()
        })?;

    if !output.status.success() {
        return Err(
            "Node.js 22.13 or newer is required, but node --version failed. Install Node.js 22.13 or newer from https://nodejs.org/en/download/."
                .to_string(),
        );
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let numbers = version.trim_start_matches('v').split('.').collect::<Vec<_>>();
    let major = numbers.first().and_then(|value| value.parse::<u32>().ok());
    let minor = numbers.get(1).and_then(|value| value.parse::<u32>().ok());

    match (major, minor) {
        (Some(major), Some(minor))
            // node:sqlite runs without --experimental-sqlite from 22.13 on the 22
            // line and from 23.4 on the 23 line, so 23.0 to 23.3 must be refused.
            if major > 23
                || (major == 23 && minor >= 4)
                || (major == NODE_MIN_MAJOR && minor >= NODE_MIN_MINOR) => Ok(()),
        _ => Err(format!(
            "Node.js 22.13 or newer is required, but {version} was found on PATH. Install Node.js 22.13 or newer from https://nodejs.org/en/download/."
        )),
    }
}

fn find_server_script<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("server/index.mjs"));
        candidates.push(resource_dir.join("resources/server/index.mjs"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../server/index.mjs"));
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/index.mjs"));

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn read_token(state_dir: &Path) -> Result<String, String> {
    fs::read_to_string(state_dir.join("token"))
        .map(|token| token.trim().to_string())
        .map_err(|error| format!("Could not read sidecar token: {error}"))
}

fn read_port(state_dir: &Path) -> Option<u16> {
    fs::read_to_string(state_dir.join("port"))
        .ok()
        .and_then(|port| port.trim().parse::<u16>().ok())
        .filter(|port| *port != 0)
}

fn health_request(port: u16, token: Option<&str>) -> Result<(), String> {
    let address = ("127.0.0.1", port)
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
        .next()
        .ok_or_else(|| "Could not resolve the local server address".to_string())?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(300))
        .map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_millis(300)))
        .map_err(|error| error.to_string())?;

    let mut request = String::from(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n",
    );
    if let Some(token) = token {
        request.push_str("Authorization: Bearer ");
        request.push_str(token);
        request.push_str("\r\n");
    }
    request.push_str("\r\n");

    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| error.to_string())?;
    let first_line = String::from_utf8_lossy(&response);
    if first_line.starts_with("HTTP/1.1 2") || first_line.starts_with("HTTP/1.0 2") {
        Ok(())
    } else {
        Err(format!("health check returned {}", first_line.lines().next().unwrap_or("no response")))
    }
}

fn format_exit_message(prefix: &str, status: ExitStatus, restart_count: u8) -> String {
    let result = status
        .code()
        .map_or_else(|| "terminated by signal".to_string(), |code| format!("exit code {code}"));
    format!("{prefix} ({result}); restart {restart_count} of {MAX_RESTARTS}.")
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(windows)]
fn configure_process_group(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(any(unix, windows)))]
fn configure_process_group(_command: &mut Command) {}

#[cfg(unix)]
mod unix_signals {
    use std::os::raw::c_int;
    use std::sync::atomic::{AtomicI32, Ordering};

    pub const SIGINT: c_int = 2;
    pub const SIGKILL: c_int = 9;
    pub const SIGTERM: c_int = 15;

    extern "C" {
        fn signal(signum: c_int, handler: extern "C" fn(c_int)) -> usize;
        fn kill(pid: c_int, signum: c_int) -> c_int;
    }

    static CAUGHT: AtomicI32 = AtomicI32::new(0);

    // Async-signal-safe on purpose: a lock-free store and nothing else. Taking
    // the child mutex or joining a thread inside a signal handler can deadlock,
    // so the waiting thread below does the actual cleanup.
    extern "C" fn catch_signal(signum: c_int) {
        CAUGHT.store(signum, Ordering::SeqCst);
    }

    /// Catch SIGTERM and SIGINT so a terminating signal runs the same cleanup a
    /// menu quit does. Without this the default action kills the application
    /// outright and the sidecar is orphaned.
    pub fn install() {
        // Safety: `catch_signal` only stores to a lock-free atomic.
        unsafe {
            signal(SIGTERM, catch_signal);
            signal(SIGINT, catch_signal);
        }
    }

    pub fn caught() -> Option<c_int> {
        match CAUGHT.load(Ordering::SeqCst) {
            0 => None,
            signum => Some(signum),
        }
    }

    /// Signal a whole process group. The sidecar leads its own group, so a
    /// negative pid reaches it and anything it went on to spawn.
    pub fn signal_group(pid: i32, signum: c_int) {
        // A pid of zero would mean our own process group, so refuse it.
        if pid <= 0 {
            return;
        }
        // Safety: a plain libc call; a missing process only returns ESRCH.
        unsafe {
            kill(-pid, signum);
            kill(pid, signum);
        }
    }
}

#[cfg(unix)]
fn kill_process_tree(child: &mut Child) {
    // Terminate before killing: the sidecar closes its database on SIGTERM, and
    // a half-closed database is how the derived cache gets corrupted. SIGKILL
    // is the fallback for a sidecar that will not go.
    let Ok(pid) = i32::try_from(child.id()) else {
        let _ = child.kill();
        return;
    };
    unix_signals::signal_group(pid, unix_signals::SIGTERM);

    let deadline = Instant::now() + TERM_GRACE;
    while Instant::now() < deadline {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        thread::sleep(TERM_POLL_INTERVAL);
    }

    unix_signals::signal_group(pid, unix_signals::SIGKILL);
    let _ = child.kill();
}

#[cfg(windows)]
fn kill_process_tree(child: &mut Child) {
    let pid = child.id().to_string();
    let _ = Command::new("taskkill")
        .arg("/PID")
        .arg(&pid)
        .arg("/T")
        .arg("/F")
        .output();
    let _ = child.kill();
}

#[cfg(not(any(unix, windows)))]
fn kill_process_tree(child: &mut Child) {
    let _ = child.kill();
}

fn tray_icon() -> tauri::image::Image<'static> {
    let size = 32_u32;
    let mut rgba = vec![0_u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let distance_x = x as i32 - 15;
            let distance_y = y as i32 - 15;
            let distance = distance_x * distance_x + distance_y * distance_y;
            let index = ((y * size + x) * 4) as usize;
            if distance <= 196 {
                rgba[index] = 220;
                rgba[index + 1] = 226;
                rgba[index + 2] = 238;
                rgba[index + 3] = 255;
            }
        }
    }
    tauri::image::Image::new_owned(rgba, size, size)
}

fn create_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItemBuilder::with_id("open", "Open Sparring").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Sparring").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &quit]).build()?;

    TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let resolved_state_dir = match resolve_state_dir() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("{error}");
            return;
        }
    };
    let manager = SidecarManager::new(resolved_state_dir);
    watch_for_signals(&manager);

    let app = tauri::Builder::default()
        .manage(manager.clone())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            sidecar_status,
            sidecar_token,
            state_dir,
            skill_resource_dir,
            window_chrome,
            notify,
            open_path
        ])
        .setup(move |app| {
            create_tray(app)?;
            manager.start(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Sparring");

    // Every exit this process can observe stops the sidecar. ExitRequested and
    // window destruction come before Exit on the paths where the event loop is
    // unwound early, and shutdown() is idempotent, so naming all three costs
    // nothing and closes the gaps between them.
    app.run(move |app_handle, event| match event {
        RunEvent::Exit | RunEvent::ExitRequested { .. } => {
            app_handle.state::<SidecarManager>().shutdown();
        }
        RunEvent::WindowEvent {
            event: tauri::WindowEvent::Destroyed,
            ..
        } => {
            app_handle.state::<SidecarManager>().shutdown();
        }
        _ => {}
    });
}

/// A terminating signal must run the same cleanup a menu quit does. The handler
/// itself only records the signal; this thread does the killing, where it is
/// allowed to take locks and join the supervisor.
#[cfg(unix)]
fn watch_for_signals(manager: &SidecarManager) {
    unix_signals::install();

    // A weak handle, so watching for a signal is not itself a reason to keep
    // the manager alive and skip its Drop.
    let weak = Arc::downgrade(&manager.inner);
    thread::Builder::new()
        .name("sparring-signal-watch".to_string())
        .spawn(move || loop {
            if let Some(signum) = unix_signals::caught() {
                if let Some(inner) = weak.upgrade() {
                    SidecarManager { inner }.shutdown();
                }
                std::process::exit(128 + signum);
            }
            thread::sleep(TERM_POLL_INTERVAL);
        })
        .expect("could not start signal watch thread");
}

#[cfg(not(unix))]
fn watch_for_signals(_manager: &SidecarManager) {}
