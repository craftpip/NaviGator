import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = process.env.WEB_ROOT || __dirname;
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);

const LOG_DIR = path.join(ROOT, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(path.join(LOG_DIR, "access.log"), { flags: "a" });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function collectBody(req, cb) {
  if (req.method === "GET" || req.method === "HEAD") return cb(null, "");
  const chunks = [];
  let size = 0;
  let truncated = false;
  req.on("data", (chunk) => {
    if (size + chunk.length > MAX_BODY) {
      truncated = true;
      chunks.push(chunk.subarray(0, Math.max(0, MAX_BODY - size)));
      size = MAX_BODY;
      return;
    }
    size += chunk.length;
    chunks.push(chunk);
  });
  req.on("end", () => {
    let body = Buffer.concat(chunks).toString("utf8");
    if (truncated) body += "\n…(body truncated)…";
    cb(null, body);
  });
  req.on("error", (err) => cb(err, ""));
}

function logRequest(req, body, outcome) {
  const ts = new Date().toISOString();
  const headers = Object.entries(req.headers).map(([k, v]) => `    ${k}: ${v}`);
  const block = [
    `[${ts}] ${req.method} ${req.url} HTTP/${req.httpVersion}`,
    `  remote: ${req.socket.remoteAddress}:${req.socket.remotePort}`,
    `  userAgent: ${req.headers["user-agent"] || "-"}`,
    `  headers:`,
    ...headers,
    `  body: ${body || "(none)"}`,
    `  outcome: ${outcome}`,
    "-".repeat(80),
  ].join("\n") + "\n";

  process.stdout.write(block);
  logStream.write(block);
}

function resolveFile(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  let filePath = path.normalize(path.join(ROOT, pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return null;
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith("logs") || rel === "server.js" || rel === "docker-compose.yml") {
    return { status: 403, file: null };
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { status: 404, file: null };
  }
  if (stat.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    try {
      stat = fs.statSync(filePath);
    } catch {
      return { status: 404, file: null };
    }
  }
  return { status: 200, file: filePath };
}

const server = http.createServer((req, res) => {
  collectBody(req, (err, body) => {
    if (err) {
      res.writeHead(400);
      res.end("Bad Request");
      logRequest(req, body, "400 bad request (body read error)");
      return;
    }
    const resolved = resolveFile(req.url);
    const outcome = `${resolved.status} ${resolved.file ? path.relative(ROOT, resolved.file) : req.url}`;
    logRequest(req, body, outcome);

    if (resolved.status !== 200) {
      res.writeHead(resolved.status, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(resolved.status === 404 ? "404 Not Found" : "403 Forbidden");
      return;
    }

    const ext = path.extname(resolved.file).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const head = {
      "Content-Type": type,
      "X-Request-Logged": "true",
    };

    if (req.method === "HEAD") {
      const size = fs.statSync(resolved.file).size;
      res.writeHead(200, { ...head, "Content-Length": size });
      res.end();
      return;
    }

    res.writeHead(200, head);

    fs.createReadStream(resolved.file)
      .on("error", () => {
        if (!res.headersSent) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("404 Not Found");
        }
      })
      .pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const banner = `[${new Date().toISOString()}] Example Test Site server listening on :${PORT} (root=${ROOT})`;
  process.stdout.write(banner + "\n");
  logStream.write(banner + "\n");
});
