#!/usr/bin/env node
/**
 * Wayfinder ticket runner — deterministic sequential execution of map tickets,
 * one `codex exec` session per ticket.
 *
 * Reads the wayfinder map (default: #17) from GitHub, derives the ticket order
 * from the map body's task list, checks native blockers, and for each open,
 * unblocked ticket spawns a codex CLI session with a fixed prompt template
 * (ticket name, number, and body injected). When a session finishes, the
 * runner records the result, and starts the next ticket.
 *
 * Usage:
 *   node scripts/run-wayfinder.mjs --list                 # show order, no run
 *   node scripts/run-wayfinder.mjs --once                 # run only the next ticket
 *   node scripts/run-wayfinder.mjs                        # run the full sequence
 *   node scripts/run-wayfinder.mjs --from 22              # resume from ticket 22
 *   node scripts/run-wayfinder.mjs --mode auto            # bypass approvals/sandbox (unattended)
 *
 * Flags:
 *   --map <n>          map issue number (default 17)
 *   --tickets <a,b,c>  explicit ticket order (overrides map order)
 *   --repo <dir>       working directory for codex sessions (default: cwd)
 *   --sandbox <mode>   codex sandbox: read-only | workspace-write | danger-full-access
 *   --mode safe|auto   safe = sandboxed (may stall on approvals); auto = bypass approvals
 *   --once             run exactly one ticket, then stop
 *   --from <n>         start at ticket n (map order)
 *   --force            run even if the ticket is closed or blocked
 *   --keep-going       continue after a failed ticket
 *   --no-close         never close tickets (comment only)
 *   --list             print the run plan and exit
 *
 * Run state lives in .wayfinder/ (state.jsonl, logs/, last-message/) so a run
 * can be resumed without redoing completed tickets.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const STATE_DIR = path.join(REPO_ROOT, ".wayfinder");
const LOG_DIR = path.join(STATE_DIR, "logs");
const LAST_MESSAGE_DIR = path.join(STATE_DIR, "last-message");
const STATE_FILE = path.join(STATE_DIR, "state.jsonl");

const DEFAULT_MAP = 17;

const PROMPT_LINES = [
  "You are executing wayfinder ticket #{number} — {title} (part of map #{map}).",
  "",
  "Repository: {repo} (the Research Canvas monorepo). Work from that root.",
  "",
  "The ticket body is included verbatim below. It is self-contained and cites the canonical",
  "design doc at docs/wayfinder/2026-08-09-refinement-2-design.md — read that doc for any",
  "section the ticket references. You may also run `gh issue view {number} --comments` for",
  "the live ticket, but the body below is authoritative for this run.",
  "",
  "STANDING CONSTRAINTS (AGENTS.md and the map's design doc):",
  "- Production readiness. Mock, demo, placeholder, and \"stub for later\" patterns are NOT",
  "  acceptable. Tests MUST test real functionality with real data.",
  "- Verify before claiming completion: run the relevant suites (pnpm vitest run,",
  "  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1,",
  "  pnpm typecheck, and Playwright where the ticket requires it) and confirm green.",
  "- Raw corpus is canonical and agent-immutable. Derived objects carry passage-level",
  "  provenance. Offline-first with explicit live opt-ins. No new locked substrate",
  "  categories except the single deliberate ENCAPSULATES relation where the design",
  "  document specifies it.",
  "- Do not silently defer any checklist item. If an item genuinely cannot be completed in",
  "  this run, say so explicitly, do NOT close the ticket, and report exactly what is",
  "  blocked.",
  "",
  "PROCEDURE:",
  "1. Read the ticket body below and the referenced design sections. Make a plan.",
  "2. Implement the FULL checklist. Every item ships and is verified — no demoification.",
  "3. Run the verification suites and confirm green before finishing.",
  "4. On success: post a resolution comment to the ticket with gh",
  "   (gh issue comment {number} --body \"<summary of what was implemented + evidence>\"),",
  "   then close it (gh issue close {number} --comment \"<resolution>\") unless the runner",
  "   passed --no-close.",
  "5. If verification fails or a checklist item cannot be completed: leave the ticket open,",
  "   post an honest status comment, and exit non-zero.",
  "",
  "=== TICKET #{number} — {title} ===",
  "{body}",
];

function parseArgs(argv) {
  const args = { map: DEFAULT_MAP, sandbox: "workspace-write", mode: "safe", repo: REPO_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return next;
    };
    switch (arg) {
      case "--map":
        args.map = Number(value());
        break;
      case "--tickets":
        args.tickets = value().split(",").map((entry) => Number(entry.trim())).filter(Boolean);
        break;
      case "--repo":
        args.repo = path.resolve(value());
        break;
      case "--sandbox":
        args.sandbox = value();
        break;
      case "--mode":
        args.mode = value();
        break;
      case "--from":
        args.from = Number(value());
        break;
      case "--once":
        args.once = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--keep-going":
        args.keepGoing = true;
        break;
      case "--no-close":
        args.noClose = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (args.mode !== "safe" && args.mode !== "auto") {
    throw new Error("--mode must be 'safe' or 'auto'");
  }
  if (!["read-only", "workspace-write", "danger-full-access"].includes(args.sandbox)) {
    throw new Error("--sandbox must be read-only | workspace-write | danger-full-access");
  }
  return args;
}

function printHelp() {
  const text = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
  const match = text.match(/\/\*\*[\s\S]*?\*\//);
  console.log(match ? match[0].replace(/^\s*\*\s?/gm, "").replace(/^\/\*\*|\*\/$/g, "").trim() : "see source header");
}

function runGh(args, options = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function ghJson(args) {
  return JSON.parse(runGh(args));
}

function fetchMapTickets(mapNumber) {
  const body = ghJson(["issue", "view", String(mapNumber), "--json", "body"]).body;
  const ordered = [];
  for (const line of body.split("\n")) {
    const match = line.match(/\[([^\]]+)\]\([^)]*\/issues\/(\d+)\)/);
    if (match) {
      ordered.push({ number: Number(match[2]), title: match[1] });
    }
  }
  return ordered;
}

function fetchTicket(number) {
  const ticket = ghJson([
    "issue",
    "view",
    String(number),
    "--json",
    "number,title,state,body",
  ]);
  let blockers = [];
  try {
    blockers = ghJson([
      "api",
      `repos/EpiLogos/research-canvas/issues/${number}/dependencies/blocked_by`,
      "--jq",
      ".",
    ]);
  } catch {
    blockers = [];
  }
  return {
    number: ticket.number,
    title: ticket.title,
    state: ticket.state,
    body: ticket.body,
    blockers: (blockers ?? []).map((blocker) => blocker.number),
  };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return new Map();
  const state = new Map();
  for (const line of fs.readFileSync(STATE_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    state.set(record.number, record);
  }
  return state;
}

function appendState(record) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(STATE_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

function isBlocked(ticket, state) {
  return ticket.blockers.some((blockerNumber) => {
    const record = state.get(blockerNumber);
    return record?.status === "done" ? false : true;
  });
}

function buildPlan(args, state) {
  let ordered = args.tickets
    ? args.tickets.map((number) => ({ number, title: `ticket ${number}` }))
    : fetchMapTickets(args.map);
  if (args.from !== undefined) {
    ordered = ordered.filter((entry) => entry.number >= args.from);
  }
  return ordered.map((entry) => {
    try {
      return fetchTicket(entry.number);
    } catch {
      return { number: entry.number, title: entry.title, state: "unknown", body: "", blockers: [] };
    }
  });
}

function spawnCodex(prompt, args, ticket) {
  const logPath = path.join(LOG_DIR, `${ticket.number}.jsonl`);
  const messagePath = path.join(LAST_MESSAGE_DIR, `${ticket.number}.txt`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(LAST_MESSAGE_DIR, { recursive: true });

  const cliArgs = [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--cd",
    args.repo,
    "--sandbox",
    args.sandbox,
    "-o",
    messagePath,
  ];
  if (args.mode === "auto") {
    cliArgs.push("--dangerously-bypass-approvals-and-sandbox");
  }
  cliArgs.push(prompt);

  const env = { ...process.env };
  for (const key of [
    "CODEX_SANDBOX",
    "CODEX_SANDBOX_NETWORK_DISABLED",
    "CODEX_PERMISSION_PROFILE",
    "CODEX_CI",
    "CODEX_THREAD_ID",
    "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
    "CODEX_SHELL",
  ]) {
    delete env[key];
  }

  const child = spawn("codex", cliArgs, { env, stdio: ["ignore", "pipe", "pipe"] });
  const log = fs.createWriteStream(logPath, { flags: "a" });
  child.stdout.pipe(log);
  child.stderr.pipe(log, { end: false });
  child.stderr.pipe(process.stderr);
  return { child, logPath, messagePath };
}

async function runTicket(ticket, args, state) {
  const prompt = PROMPT_LINES
    .join("\n")
    .replaceAll("{number}", String(ticket.number))
    .replaceAll("{title}", ticket.title)
    .replaceAll("{map}", String(args.map))
    .replaceAll("{repo}", args.repo)
    .replaceAll("{body}", ticket.body);

  console.log(`[wayfinder] starting ticket #${ticket.number} — ${ticket.title}`);
  appendState({ number: ticket.number, status: "running", startedAt: new Date().toISOString() });

  const { child, logPath, messagePath } = spawnCodex(prompt, args, ticket);
  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`[wayfinder] failed to spawn codex for #${ticket.number}:`, error.message);
      resolve(1);
    });
  });

  let closed = false;
  if (exitCode === 0 && !args.noClose) {
    try {
      closed = ghJson(["issue", "view", String(ticket.number), "--json", "state"]).state === "CLOSED";
    } catch {
      closed = false;
    }
  }

  let lastMessage = "";
  try {
    lastMessage = fs.readFileSync(messagePath, "utf8").trim();
  } catch {
    lastMessage = "";
  }

  const record = {
    number: ticket.number,
    status: exitCode === 0 ? (closed || args.noClose ? "done" : "needs-review") : "failed",
    exitCode,
    closed,
    finishedAt: new Date().toISOString(),
    logPath,
    lastMessage,
  };
  appendState(record);
  console.log(
    `[wayfinder] ticket #${ticket.number} ${record.status} (exit ${exitCode})` +
      (closed ? ", closed on GitHub" : "") +
      ` — log: ${logPath}`,
  );
  if (record.lastMessage) {
    console.log(`[wayfinder] #${ticket.number} last message:\n${record.lastMessage.slice(0, 1200)}`);
  }
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const state = loadState();
  const plan = buildPlan(args, state);

  if (plan.length === 0) {
    console.log("[wayfinder] no tickets found in the map.");
    return;
  }

  if (args.list) {
    console.log(`[wayfinder] run plan for map #${args.map} (${plan.length} tickets):`);
    for (const ticket of plan) {
      const stateRecord = state.get(ticket.number);
      const status = stateRecord?.status ?? "pending";
      const blocked = isBlocked(ticket, state) ? " [blocked]" : "";
      console.log(`  #${ticket.number} ${ticket.state} ${status}${blocked} — ${ticket.title}`);
    }
    return;
  }

  if (args.mode === "auto") {
    console.warn(
      "[wayfinder] WARNING: --mode auto bypasses approvals and sandboxing for codex sessions. " +
        "Sessions have full filesystem access. Ensure this is what you want.",
    );
  }

  let failed = false;
  for (const ticket of plan) {
    const prior = state.get(ticket.number);
    if (!args.force && prior?.status === "done") {
      console.log(`[wayfinder] skipping #${ticket.number} (already ${prior.status})`);
      continue;
    }
    if (!args.force && ticket.state === "CLOSED") {
      console.log(`[wayfinder] skipping #${ticket.number} (ticket already closed on GitHub)`);
      continue;
    }
    if (!args.force && isBlocked(ticket, state)) {
      console.log(`[wayfinder] skipping #${ticket.number} (open blocker)`);
      continue;
    }
    const record = await runTicket(ticket, args, state);
    if (record.status === "failed" && !args.keepGoing) {
      failed = true;
      break;
    }
    if (args.once) break;
  }

  if (failed) {
    console.error("[wayfinder] run stopped after a failed ticket (use --keep-going to continue).");
    process.exit(1);
  }
  console.log("[wayfinder] run complete.");
}

main().catch((error) => {
  console.error(`[wayfinder] ${error.message}`);
  process.exit(1);
});
