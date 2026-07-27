use std::env;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use research_canvas_desktop_lib::db::connection::Database;
use research_canvas_desktop_lib::workspace::{
    backup_database, configured_database_path, database_roots, database_summary,
    prepare_database_path, restore_database, WorkspaceError,
};

fn main() -> ExitCode {
    match run(env::args().skip(1).collect()) {
        Ok(output) => {
            if !output.is_empty() {
                println!("{output}");
            }
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("workspace_sqlite: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(arguments: Vec<String>) -> Result<String, String> {
    let command = arguments.first().map(String::as_str).unwrap_or("help");
    match command {
        "path" => {
            let prepare = arguments.iter().any(|argument| argument == "--prepare");
            let path = if prepare {
                prepare_database_path(None)
            } else {
                configured_database_path(None)
            }
            .map_err(|error| error.to_string())?;
            Ok(path.to_string_lossy().to_string())
        }
        "backup" => {
            require_argument_count(&arguments, 3, "backup <source> <destination>")?;
            backup_database(Path::new(&arguments[1]), Path::new(&arguments[2]))
                .map_err(|error| error.to_string())?;
            Ok("SQLite backup complete".to_string())
        }
        "initialize" => {
            require_argument_count(&arguments, 2, "initialize <database>")?;
            Database::open(Path::new(&arguments[1])).map_err(|error| error.to_string())?;
            Ok("SQLite workspace initialized".to_string())
        }
        "counts" => {
            require_argument_count(&arguments, 2, "counts <database>")?;
            let summary =
                database_summary(Path::new(&arguments[1])).map_err(|error| error.to_string())?;
            serde_json::to_string_pretty(&summary).map_err(|error| error.to_string())
        }
        "roots" => {
            require_argument_count(&arguments, 2, "roots <database>")?;
            let roots =
                database_roots(Path::new(&arguments[1])).map_err(|error| error.to_string())?;
            serde_json::to_string_pretty(&roots).map_err(|error| error.to_string())
        }
        "restore" => restore(&arguments),
        "help" | "--help" | "-h" => Ok(usage().to_string()),
        unknown => Err(format!("unknown command '{unknown}'\n{}", usage())),
    }
}

fn restore(arguments: &[String]) -> Result<String, String> {
    if arguments.len() < 3 {
        return Err(format!(
            "usage: workspace_sqlite restore <source> <destination> [--replace] \
             [--old-repository-root <path> --new-repository-root <path>]"
        ));
    }
    let source = PathBuf::from(&arguments[1]);
    let destination = PathBuf::from(&arguments[2]);
    let replace = arguments.iter().any(|argument| argument == "--replace");
    if destination.exists() && !replace {
        return Err(format!(
            "destination already exists: {}; pass --replace to replace it deliberately",
            destination.display()
        ));
    }
    let old_root = flag_value(arguments, "--old-repository-root")?;
    let new_root = flag_value(arguments, "--new-repository-root")?;
    let repository_roots = match (old_root, new_root) {
        (Some(old), Some(new)) => Some((PathBuf::from(old), PathBuf::from(new))),
        (None, None) => None,
        _ => {
            return Err(
                "--old-repository-root and --new-repository-root must be supplied together"
                    .to_string(),
            )
        }
    };
    restore_database(
        &source,
        &destination,
        replace,
        repository_roots
            .as_ref()
            .map(|(old, new)| (old.as_path(), new.as_path())),
    )
    .map_err(format_restore_error)?;
    Ok("SQLite restore complete".to_string())
}

fn flag_value<'a>(arguments: &'a [String], flag: &str) -> Result<Option<&'a str>, String> {
    let Some(position) = arguments.iter().position(|argument| argument == flag) else {
        return Ok(None);
    };
    arguments
        .get(position + 1)
        .map(String::as_str)
        .map(Some)
        .ok_or_else(|| format!("{flag} requires a path"))
}

fn format_restore_error(error: WorkspaceError) -> String {
    match error {
        WorkspaceError::DestinationExists(path) => format!(
            "destination already exists: {}; pass --replace to replace it deliberately",
            path.display()
        ),
        other => other.to_string(),
    }
}

fn require_argument_count(
    arguments: &[String],
    count: usize,
    usage_suffix: &str,
) -> Result<(), String> {
    if arguments.len() == count {
        Ok(())
    } else {
        Err(format!("usage: workspace_sqlite {usage_suffix}"))
    }
}

fn usage() -> &'static str {
    "workspace_sqlite commands:\n\
     \x20 path [--prepare]\n\
     \x20 backup <source> <destination>\n\
     \x20 initialize <database>\n\
     \x20 counts <database>\n\
     \x20 roots <database>\n\
     \x20 restore <source> <destination> [--replace] \
        [--old-repository-root <path> --new-repository-root <path>]"
}
