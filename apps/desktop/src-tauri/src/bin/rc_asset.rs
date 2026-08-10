use std::collections::HashMap;
use std::process;

use research_canvas_desktop_lib::{
    commands::fetch_asset::{
        content_addressed_import, ingest_fetched_asset_at, list_fetch_records_at,
        sniff_image_mime, DEFAULT_CAP_BYTES, IngestFetchedAssetRequest, LICENSE_ALLOW_LIST,
        SOURCE_ALLOW_LIST,
    },
    db::repositories::{FetchRecord, StreetViewRegion},
};
use serde::Serialize;

/// `rc-asset` — the deterministic app-side gate for agent-gathered imagery
/// (refinement-2 D3, ticket #20). The agent runs this inside the background
/// tmux session; the app never fetches. The gate reads the bytes the agent
/// already placed on disk, validates mime/byte-size/license/source against
/// allow-lists, content-address imports into the media store, wires the local
/// redaction pipeline, and writes the D3 fetch-record provenance.
fn main() {
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        return;
    }

    let command = args.remove(0);
    let options = parse_options(args);
    let json_mode = options.flag("json");

    let result = dispatch(&command, &options);
    match result {
        Ok(outcome) => {
            if json_mode {
                print_json(&outcome.value);
            } else {
                println!("{}", human_output(&command, &outcome.value));
            }
            if !outcome.accepted {
                // Rejected: the reason is visible above; fail loudly so the
                // agent in the tmux session can react (fix the license, pick a
                // smaller image, use an allowed source).
                process::exit(2);
            }
        }
        Err(error) => {
            if json_mode {
                print_json(&serde_json::json!({
                    "command": command,
                    "ok": false,
                    "error": error,
                }));
            } else {
                eprintln!("rc-asset {command}: {error}");
            }
            process::exit(1);
        }
    }
}

struct Outcome {
    value: serde_json::Value,
    accepted: bool,
}

fn dispatch(command: &str, options: &Options) -> Result<Outcome, String> {
    if let Some(error) = &options.parse_error {
        return Err(error.clone());
    }

    match command {
        "ingest" => {
            let request = ingest_request(options)?;
            let record = ingest_fetched_asset_at(&request)?;
            let accepted = record.validation.all_ok();
            let value = serde_json::to_value(&record).map_err(|error| error.to_string())?;
            Ok(Outcome { value, accepted })
        }
        "list" => {
            let records = list_fetch_records_at(
                required(options, "database")?,
                required(options, "profile-scope")?,
            )?;
            let value = serde_json::to_value(&records).map_err(|error| error.to_string())?;
            Ok(Outcome {
                value,
                accepted: true,
            })
        }
        other => Err(format!("unknown command: {other}")),
    }
}

fn ingest_request(options: &Options) -> Result<IngestFetchedAssetRequest, String> {
    let regions = options
        .values_of("redaction-region")
        .into_iter()
        .map(|raw| parse_region(raw))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(IngestFetchedAssetRequest {
        database_path: required(options, "database")?.to_string(),
        media_root: required(options, "media-root")?.to_string(),
        profile_scope: options.value("profile-scope").map(str::to_string),
        agent_session_id: required(options, "agent-session")?.to_string(),
        source_url: required(options, "source-url")?.to_string(),
        license: required(options, "license")?.to_string(),
        fetched_at: options.value("fetched-at").map(str::to_string),
        source_path: required(options, "source-path")?.to_string(),
        place_id: options.value("place").map(str::to_string),
        walk_id: options.value("walk").map(str::to_string),
        scene_id: options.value("scene").map(str::to_string),
        redaction_regions: regions,
        cap_bytes: options
            .value("cap-bytes")
            .map(|value| value.parse::<u64>())
            .transpose()
            .map_err(|error| format!("invalid --cap-bytes: {error}"))?,
    })
}

fn parse_region(raw: &str) -> Result<StreetViewRegion, String> {
    let parts = raw.split(',').collect::<Vec<_>>();
    if parts.len() != 6 {
        return Err(format!(
            "--redaction-region expects x,y,width,height,reason,source; got {raw}"
        ));
    }
    let parse = |index: usize| {
        parts[index]
            .parse::<f64>()
            .map_err(|error| format!("invalid region coordinate {}: {error}", parts[index]))
    };
    Ok(StreetViewRegion {
        x: parse(0)?,
        y: parse(1)?,
        width: parse(2)?,
        height: parse(3)?,
        reason: parts[4].to_string(),
        source: parts[5].to_string(),
    })
}

fn human_output(command: &str, value: &serde_json::Value) -> String {
    match command {
        "ingest" => render_ingest(value),
        "list" => render_list(value),
        _ => serde_json::to_string_pretty(value).expect("serialize human output"),
    }
}

fn render_ingest(value: &serde_json::Value) -> String {
    let id = value["id"].as_str().unwrap_or("");
    let mime = value["mimeType"].as_str().unwrap_or("");
    let size = value["byteSize"].as_i64().unwrap_or_default();
    let hash = value["contentHash"].as_str().unwrap_or("").get(..12).unwrap_or("");
    let status = value["redactionStatus"].as_str().unwrap_or("");
    let artifact = value["artifactPath"].as_str().unwrap_or("");

    let v = &value["validation"];
    let flags = [
        ("mime", v["mimeOk"].as_bool().unwrap_or(false)),
        ("size", v["sizeOk"].as_bool().unwrap_or(false)),
        ("license", v["licenseOk"].as_bool().unwrap_or(false)),
        ("source", v["sourceOk"].as_bool().unwrap_or(false)),
    ];

    let mut out = format!(
        "# rc-asset ingest\n\nid: {id}\nbytes: {size} ({mime})\nsha256: {hash}...\n"
    );
    out.push_str("\n## Gate validation\n");
    for (name, ok) in flags {
        out.push_str(&format!("- {name}: {}\n", if ok { "PASS" } else { "FAIL" }));
    }

    if artifact.is_empty() {
        out.push_str("\nREJECTED — bytes were not imported. Fix the FAIL flag(s) and re-run.\n");
    } else {
        out.push_str(&format!(
            "\nAccepted — imported to {artifact}\nredactionStatus: {status}\n"
        ));
        if let Some(sv_id) = value["streetViewImageId"].as_str() {
            out.push_str(&format!("streetViewImageId: {sv_id}\n"));
        }
        let place = value["placeId"].as_str().unwrap_or("");
        let walk = value["walkId"].as_str().unwrap_or("");
        let scene = value["sceneId"].as_str().unwrap_or("");
        out.push_str(&format!(
            "association: place={} walk={} scene={}\n",
            if place.is_empty() { "-" } else { place },
            if walk.is_empty() { "-" } else { walk },
            if scene.is_empty() { "-" } else { scene },
        ));
    }
    out
}

fn render_list(value: &serde_json::Value) -> String {
    let records = value.as_array().map(Vec::as_slice).unwrap_or(&[]);
    let mut out = format!("# rc-asset records ({})\n", records.len());
    for record in records {
        let accepted = !record["artifactPath"].as_str().unwrap_or("").is_empty();
        out.push_str(&format!(
            "\n- {} [{}] {}{}\n",
            record["id"].as_str().unwrap_or(""),
            if accepted { "accepted" } else { "rejected" },
            record["license"].as_str().unwrap_or(""),
            if accepted { "" } else { " (validation FAILED)" },
        ));
    }
    out
}

fn required<'a>(options: &'a Options, name: &str) -> Result<&'a str, String> {
    options
        .value(name)
        .ok_or_else(|| format!("missing required --{name}"))
}

#[derive(Debug, Default)]
struct Options {
    values: HashMap<String, Vec<String>>,
    flags: Vec<String>,
    parse_error: Option<String>,
}

impl Options {
    fn value(&self, name: &str) -> Option<&str> {
        self.values.get(name).and_then(|values| values.first()).map(String::as_str)
    }

    fn values_of(&self, name: &str) -> Vec<&str> {
        self.values
            .get(name)
            .map(|values| values.iter().map(String::as_str).collect())
            .unwrap_or_default()
    }

    fn flag(&self, name: &str) -> bool {
        self.flags.iter().any(|flag| flag == name)
    }
}

fn parse_options(args: Vec<String>) -> Options {
    let mut options = Options::default();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if !arg.starts_with("--") {
            index += 1;
            continue;
        }
        let key = arg.trim_start_matches("--").to_string();
        if key == "json" {
            options.flags.push(key);
            index += 1;
            continue;
        }
        if let Some(value) = args.get(index + 1).filter(|value| !value.starts_with("--")) {
            options.values.entry(key).or_default().push(value.clone());
            index += 2;
        } else {
            if options.parse_error.is_none() {
                options.parse_error = Some(format!("missing value for --{key}"));
            }
            index += 1;
        }
    }
    options
}

fn print_json<T: Serialize>(value: &T) {
    println!(
        "{}",
        serde_json::to_string_pretty(value).expect("serialize CLI JSON")
    );
}

#[allow(dead_code)]
fn _reference_allow_lists() {
    // Keep the allow-lists import alive for `--help` documentation clarity;
    // the gate itself lives in the lib and is what actually enforces them.
    let _ = (LICENSE_ALLOW_LIST, SOURCE_ALLOW_LIST, DEFAULT_CAP_BYTES);
    let _ = (content_addressed_import as fn(&std::path::Path, &[u8], &str) -> Result<String, String>,);
    let _ = sniff_image_mime as fn(&[u8]) -> Option<&'static str>;
}

fn print_help() {
    println!(
        "rc-asset <command> [options]\n\n\
        The deterministic app-side gate for agent-gathered imagery.\n\
        Runs offline; the agent does the network fetch, the gate validates the bytes on disk.\n\n\
        Commands:\n\
          ingest  validate + content-address import + redaction + association\n\
          list    list fetch records for a profile scope\n\n\
        ingest options:\n\
          --database <path>          SQLite database path\n\
          --media-root <path>        media store root (contains street-view/)\n\
          --profile-scope <scope>    profile scope (default: active profile)\n\
          --agent-session <id>       durable tmux session id that produced the asset\n\
          --source-url <url>         http(s) URL the agent fetched from (gate never fetches)\n\
          --license <license>        license text; allow-list: {}\n\
          --fetched-at <timestamp>   retrieval timestamp (ISO-8601; default: now)\n\
          --source-path <path>       absolute path to the fetched bytes\n\
          --place <placeId>          optional place association\n\
          --walk <walkId>            optional walk association\n\
          --scene <sceneId>          optional scene association\n\
          --redaction-region <x,y,width,height,reason,source>  repeatable; reasons: face|license_plate|manual; sources: detected|manual\n\
          --cap-bytes <n>            byte-size cap (default: {})\n\
          --json                     machine-readable output\n\n\
        list options:\n\
          --database <path> --profile-scope <scope> [--json]",
        LICENSE_ALLOW_LIST.join(", "),
        DEFAULT_CAP_BYTES,
    );
}

// Keep the concrete record type in the binary's type-checked surface so
// serialization shape changes fail the build here too.
#[allow(dead_code)]
fn _typecheck(_record: &FetchRecord) {}
