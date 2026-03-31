import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT ?? 4789);
const HOST = "127.0.0.1";

const sessions = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, corsHeaders({
    "Content-Type": "application/json; charset=utf-8"
  }));
  response.end(JSON.stringify(payload));
}

function corsHeaders(headers = {}) {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    ...headers
  };
}

function resolveShell() {
  const shell = process.env.SHELL ?? "/bin/sh";
  if (existsSync(shell)) {
    return shell;
  }

  if (existsSync("/bin/zsh")) {
    return "/bin/zsh";
  }

  return "/bin/sh";
}

function shellArguments(shellPath) {
  const shellName = shellPath.split("/").pop() ?? "";
  if (shellName === "bash") {
    return ["-i"];
  }

  return ["-i"];
}

function spawnSession(workdir) {
  const shell = resolveShell();
  const sessionId = randomUUID();
  const chunks = [];
  const child = spawn(shell, shellArguments(shell), {
    cwd: workdir,
    env: {
      ...process.env,
      COLORTERM: "truecolor",
      TERM: "xterm-256color"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdout.on("data", (buffer) => {
    chunks.push({
      cursor: chunks.length + 1,
      data: buffer.toString("utf8")
    });
  });

  child.stderr.on("data", (buffer) => {
    chunks.push({
      cursor: chunks.length + 1,
      data: buffer.toString("utf8")
    });
  });

  child.on("exit", () => {
    chunks.push({
      cursor: chunks.length + 1,
      data: ""
    });
  });

  const session = {
    chunks,
    columns: 120,
    child,
    id: sessionId,
    rows: 32,
    shell,
    workdir
  };

  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  return session;
}

function sessionSnapshot(session) {
  return {
    columns: session.columns,
    id: session.id,
    rows: session.rows,
    shell: session.shell,
    workdir: session.workdir
  };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/terminal/session") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = body ? JSON.parse(body) : {};
      const workdir = payload.workdir ?? process.cwd();
      const session = spawnSession(workdir);
      sendJson(response, 200, sessionSnapshot(session));
    });
    return;
  }

  const sessionMatch = url.pathname.match(/^\/terminal\/session\/([^/]+)(?:\/(input|resize|output|close))?$/);
  if (!sessionMatch) {
    response.writeHead(404, corsHeaders());
    response.end();
    return;
  }

  const sessionId = sessionMatch[1];
  const action = sessionMatch[2] ?? "";
  const session = getSession(sessionId);
  if (!session) {
    sendJson(response, 404, { error: "Session not found" });
    return;
  }

  if (request.method === "GET" && action === "output") {
    const cursor = Number(url.searchParams.get("cursor") ?? 0);
    const chunks = session.chunks.filter((chunk) => chunk.cursor > cursor);
    const nextCursor = session.chunks.length;
    sendJson(response, 200, { chunks, nextCursor });
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const payload = body ? JSON.parse(body) : {};

    if (request.method === "POST" && action === "input") {
      session.child.stdin.write(payload.input ?? "");
      sendJson(response, 200, sessionSnapshot(session));
      return;
    }

    if (request.method === "POST" && action === "resize") {
      session.columns = payload.columns ?? session.columns;
      session.rows = payload.rows ?? session.rows;
      sendJson(response, 200, sessionSnapshot(session));
      return;
    }

    if (request.method === "DELETE" && action === "close") {
      session.child.kill();
      sessions.delete(sessionId);
      sendJson(response, 200, { closed: true });
      return;
    }

    sendJson(response, 405, { error: "Unsupported action" });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[terminal-bridge] listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  for (const session of sessions.values()) {
    session.child.kill();
  }

  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
