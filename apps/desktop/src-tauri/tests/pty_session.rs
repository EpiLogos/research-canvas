use std::{path::PathBuf, time::Duration};

use research_canvas_desktop_lib::pty::TerminalManager;
use tempfile::tempdir;

fn wait_for_output(manager: &TerminalManager, session_id: &str, needle: &str) -> String {
    manager
        .wait_for_output(session_id, needle, Duration::from_secs(10))
        .expect("terminal output")
}

#[test]
fn terminal_session_uses_the_requested_workdir_and_executes_real_shell_input() {
    let tempdir = tempdir().expect("temp dir");
    let manager = TerminalManager::new();
    let session = manager
        .create_session(PathBuf::from(tempdir.path()))
        .expect("create terminal session");

    manager
        .send_input(&session.id, "pwd\n")
        .expect("send terminal input");

    let output = wait_for_output(
        &manager,
        &session.id,
        tempdir.path().to_string_lossy().as_ref(),
    );
    assert!(
        output.contains(tempdir.path().to_string_lossy().as_ref()),
        "expected the shell to report the session workdir, got: {output:?}"
    );
}

#[test]
fn terminal_session_accepts_multiple_commands_from_a_real_shell() {
    let tempdir = tempdir().expect("temp dir");
    let manager = TerminalManager::new();
    let session = manager
        .create_session(PathBuf::from(tempdir.path()))
        .expect("create terminal session");

    manager
        .send_input(&session.id, "printf 'hello from pty\\n'\n")
        .expect("send terminal input");

    let output = wait_for_output(&manager, &session.id, "hello from pty");
    assert!(
        output.contains("hello from pty"),
        "expected real shell output, got: {output:?}"
    );
}
