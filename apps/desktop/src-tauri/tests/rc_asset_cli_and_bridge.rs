//! Automated coverage for the `rc-asset` CLI (arg parsing, exit codes 1/2,
//! JSON + human output) and the terminal-bridge fetch-record routes
//! (`GET /workspace/fetch-records`, `POST /workspace/fetch-records/ingest`
//! → 201/422), locking the transport contract (review finding M5).
use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Output};

use image::{Rgb, RgbImage};
use serde_json::{json, Value};
use tempfile::tempdir;

fn write_real_png(path: &std::path::Path) {
    let mut image = RgbImage::from_pixel(48, 48, Rgb([40, 80, 120]));
    for y in 0..12 {
        for x in 0..12 {
            image.put_pixel(
                x,
                y,
                if (x + y) % 2 == 0 {
                    Rgb([200, 30, 30])
                } else {
                    Rgb([250, 240, 220])
                },
            );
        }
    }
    image.save(path).expect("write real png fixture");
}

fn rc_asset_binary_path() -> std::path::PathBuf {
    for var in ["CARGO_BIN_EXE_rc-asset", "CARGO_BIN_EXE_rc_asset"] {
        if let Ok(path) = std::env::var(var) {
            return path.into();
        }
    }
    binary_alongside_test_binary("rc-asset")
}

fn terminal_bridge_binary_path() -> std::path::PathBuf {
    for var in ["CARGO_BIN_EXE_terminal_bridge"] {
        if let Ok(path) = std::env::var(var) {
            return path.into();
        }
    }
    binary_alongside_test_binary("terminal_bridge")
}

fn binary_alongside_test_binary(name: &str) -> std::path::PathBuf {
    let mut path = std::env::current_exe().expect("current test exe");
    path.pop();
    if path.ends_with("deps") {
        path.pop();
    }
    path.push(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    path
}

fn run_rc_asset(args: &[&str]) -> Output {
    Command::new(rc_asset_binary_path())
        .env("RESEARCH_CANVAS_ENV_FILE", "")
        .args(args)
        .output()
        .expect("run rc-asset")
}

fn stdout_json(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).expect("stdout json")
}

fn ingest_args(database: &str, media_root: &str, source: &std::path::Path, extra: &[&str]) -> Vec<String> {
    let mut args = vec![
        "ingest".to_string(),
        "--database".to_string(),
        database.to_string(),
        "--media-root".to_string(),
        media_root.to_string(),
        "--profile-scope".to_string(),
        "bootstrapping".to_string(),
        "--agent-session".to_string(),
        "research-canvas-cli-test".to_string(),
        "--source-url".to_string(),
        "https://upload.wikimedia.org/wikipedia/commons/example.png".to_string(),
        "--license".to_string(),
        "public domain".to_string(),
        "--source-path".to_string(),
        source.to_string_lossy().to_string(),
    ];
    args.extend(extra.iter().map(|value| value.to_string()));
    args
}

#[test]
fn cli_prints_help_and_exits_zero_without_args() {
    let output = run_rc_asset(&[]);
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(stdout.contains("rc-asset <command>"));
    assert!(stdout.contains("ingest"));
    assert!(stdout.contains("list"));
}

#[test]
fn cli_missing_required_option_exits_one_with_json_error() {
    // No --database on ingest: hard error path → exit 1.
    let output = run_rc_asset(&["ingest", "--json"]);
    assert_eq!(output.status.code(), Some(1));
    let value = stdout_json(&output);
    assert_eq!(value["ok"], false);
    assert_eq!(value["command"], "ingest");
    assert!(value["error"].as_str().expect("error").contains("--database"));
}

#[test]
fn cli_valid_ingest_exits_zero_and_emits_record_json() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database = dir.path().join("cli.sqlite").to_string_lossy().to_string();

    let args = ingest_args(&database, &media_root.to_string_lossy(), &source, &["--json"]);
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_rc_asset(&arg_refs);
    assert_eq!(
        output.status.code(),
        Some(0),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value = stdout_json(&output);
    let validation = &value["validation"];
    assert_eq!(validation["mimeOk"], true);
    assert_eq!(validation["sizeOk"], true);
    assert_eq!(validation["licenseOk"], true);
    assert_eq!(validation["sourceOk"], true);
    assert!(!value["artifactPath"].as_str().unwrap().is_empty());
    assert_eq!(value["redactionStatus"], "pending");
}

#[test]
fn cli_rejected_ingest_exits_two_with_empty_artifact_path() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database = dir.path().join("cli.sqlite").to_string_lossy().to_string();

    // Bad license → validation rejection → exit 2.
    let mut args = ingest_args(&database, &media_root.to_string_lossy(), &source, &["--json"]);
    let license_index = args.iter().position(|arg| arg == "--license").unwrap() + 1;
    args[license_index] = "proprietary".to_string();
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_rc_asset(&arg_refs);
    assert_eq!(output.status.code(), Some(2));
    let value = stdout_json(&output);
    assert_eq!(value["validation"]["licenseOk"], false);
    assert!(value["artifactPath"].as_str().unwrap().is_empty());
    assert!(value["streetViewImageId"].is_null());
}

#[test]
fn cli_human_output_is_not_raw_json() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database = dir.path().join("cli.sqlite").to_string_lossy().to_string();

    let args = ingest_args(&database, &media_root.to_string_lossy(), &source, &[]);
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_rc_asset(&arg_refs);
    assert_eq!(output.status.code(), Some(0));
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(stdout.contains("# rc-asset ingest"));
    assert!(stdout.contains("Gate validation"));
    assert!(!stdout.trim_start().starts_with('{'), "human output must not be raw JSON");
}

#[test]
fn cli_list_reports_accepted_and_rejected_records() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database = dir.path().join("cli.sqlite").to_string_lossy().to_string();

    let accepted_args = ingest_args(&database, &media_root.to_string_lossy(), &source, &[]);
    let accepted_refs: Vec<&str> = accepted_args.iter().map(String::as_str).collect();
    let accepted = run_rc_asset(&accepted_refs);
    assert_eq!(accepted.status.code(), Some(0));

    // A second, rejected attempt with a different URL + bad license.
    let mut rejected_args = ingest_args(&database, &media_root.to_string_lossy(), &source, &[]);
    let url_index = rejected_args.iter().position(|arg| arg == "--source-url").unwrap() + 1;
    rejected_args[url_index] = "https://upload.wikimedia.org/wikipedia/commons/other.png".to_string();
    let license_index = rejected_args.iter().position(|arg| arg == "--license").unwrap() + 1;
    rejected_args[license_index] = "proprietary".to_string();
    let rejected_refs: Vec<&str> = rejected_args.iter().map(String::as_str).collect();
    let rejected = run_rc_asset(&rejected_refs);
    assert_eq!(rejected.status.code(), Some(2));

    let list = run_rc_asset(&["list", "--database", &database, "--profile-scope", "bootstrapping", "--json"]);
    assert_eq!(list.status.code(), Some(0));
    let records = stdout_json(&list);
    let records = records.as_array().expect("list json array");
    assert_eq!(records.len(), 2);
    let accepted_count = records
        .iter()
        .filter(|record| !record["artifactPath"].as_str().unwrap().is_empty())
        .count();
    let rejected_count = records
        .iter()
        .filter(|record| record["artifactPath"].as_str().unwrap().is_empty())
        .count();
    assert_eq!(accepted_count, 1);
    assert_eq!(rejected_count, 1);
}

// ---- terminal-bridge routes ----

fn free_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind free port");
    let port = listener.local_addr().expect("local addr").port();
    drop(listener);
    port
}

struct BridgeGuard(Option<Child>);

impl Drop for BridgeGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn start_bridge(database_path: &str) -> (BridgeGuard, u16) {
    let port = free_port();
    let child = Command::new(terminal_bridge_binary_path())
        .env("RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT", port.to_string())
        .env("RESEARCH_CANVAS_DATABASE_PATH", database_path)
        .env("RESEARCH_CANVAS_ENV_FILE", "")
        .env_remove("NEO4J_URI")
        .env_remove("NEO4J_PASSWORD")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn terminal bridge");
    let guard = BridgeGuard(Some(child));

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "terminal bridge did not start listening on {port}"
        );
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    (guard, port)
}

/// Minimal raw HTTP client: enough to assert status codes and JSON bodies.
fn http_request(port: u16, method: &str, path: &str, body: Option<&[u8]>) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect bridge");
    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n");
    if let Some(body) = body {
        request.push_str(&format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n",
            body.len()
        ));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).expect("write request head");
    if let Some(body) = body {
        stream.write_all(body).expect("write request body");
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).expect("read response");
    let status_line = response.lines().next().unwrap_or("");
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);
    let body_start = response
        .find("\r\n\r\n")
        .map(|index| index + 4)
        .unwrap_or(response.len());
    (status, response[body_start..].to_string())
}

#[test]
fn bridge_fetch_record_routes_report_201_and_422_and_list() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database = dir.path().join("bridge.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let (_guard, port) = start_bridge(&database);

    // GET before any ingest → 200 with an empty array.
    let (status, body) = http_request(
        port,
        "GET",
        "/workspace/fetch-records?profileScope=bootstrapping",
        None,
    );
    assert_eq!(status, 200, "GET list body: {body}");
    let records: Vec<Value> = serde_json::from_str(&body).expect("json array");
    assert!(records.is_empty());

    // POST accepted ingest → 201 with an artifact path.
    let accepted_payload = json!({
        "databasePath": database,
        "mediaRoot": media_root_str,
        "profileScope": "bootstrapping",
        "agentSessionId": "research-canvas-bridge-test",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/example.png",
        "license": "public domain",
        "fetchedAt": "2026-08-10T10:00:00.000Z",
        "sourcePath": source.to_string_lossy(),
        "placeId": "root-archetypal-field:place-amsterdam",
    });
    let (status, body) = http_request(
        port,
        "POST",
        "/workspace/fetch-records/ingest",
        Some(accepted_payload.to_string().as_bytes()),
    );
    assert_eq!(status, 201, "accepted ingest body: {body}");
    let record: Value = serde_json::from_str(&body).expect("record json");
    assert!(!record["artifactPath"].as_str().unwrap().is_empty());
    assert_eq!(record["redactionStatus"], "pending");
    assert_eq!(record["placeId"], "root-archetypal-field:place-amsterdam");

    // POST rejected ingest (bad license, different URL) → 422 with empty path.
    // `profileScope` must be present: a blank scope is a hard Err (→ 500),
    // while a bad license is a gate rejection (→ 422).
    let rejected_payload = json!({
        "databasePath": database,
        "mediaRoot": media_root_str,
        "profileScope": "bootstrapping",
        "agentSessionId": "research-canvas-bridge-test",
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/other.png",
        "license": "proprietary",
        "sourcePath": source.to_string_lossy(),
    });
    let (status, body) = http_request(
        port,
        "POST",
        "/workspace/fetch-records/ingest",
        Some(rejected_payload.to_string().as_bytes()),
    );
    assert_eq!(status, 422, "rejected ingest body: {body}");
    let record: Value = serde_json::from_str(&body).expect("record json");
    assert!(record["artifactPath"].as_str().unwrap().is_empty());
    assert_eq!(record["validation"]["licenseOk"], false);

    // GET after → 2 records.
    let (status, body) = http_request(
        port,
        "GET",
        "/workspace/fetch-records?profileScope=bootstrapping",
        None,
    );
    assert_eq!(status, 200);
    let records: Vec<Value> = serde_json::from_str(&body).expect("json array");
    assert_eq!(records.len(), 2, "one accepted + one rejected record");
}
