// ---------------------------------------------------------------------------
// The whole backend. Static files + two AI endpoints. No framework, no build.
//
//   npm start          -> http://localhost:3000
//
// Everything else — who the children are, what they changed, how they share —
// lives in the browser. There is no database to run on workshop morning.
//
// This same file is the reference for the hosted version: if you drop the AI
// routes into an existing server (SoulCircle), copy the handler bodies plus
// server/auth.js and server/ai.js, and keep the key in that host's env.
// ---------------------------------------------------------------------------
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { askAI, banter, aiInfo } from "./ai.js";
import { checkAccess, authInfo } from "./auth.js";
import { sanitize } from "../public/js/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);

// Where the static site is allowed to call this server from.
// WORKSHOP_ORIGINS="https://you.github.io" — unset means same-origin only.
const ALLOWED_ORIGINS = (process.env.WORKSHOP_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const AVATARS = JSON.parse(
  await fsp.readFile(path.join(PUBLIC_DIR, "avatars", "manifest.json"), "utf8"),
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, x-workshop-code",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-max-age": "86400",
  };
}

function sendJSON(req, res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// --- static ----------------------------------------------------------------

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";

  const filePath = path.join(PUBLIC_DIR, rel);
  // Never serve anything outside public/.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("לא נמצא");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      // Assets can cache hard; pages must not, so an edit shows up on reload.
      "cache-control": ext === ".webp" ? "public, max-age=86400" : "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// --- api -------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req)).end();
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      return sendJSON(req, res, 200, {
        ok: true,
        model: aiInfo.model,
        hasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
        requiresCode: authInfo.requiresCode,
        codes: authInfo.codes,
        usedToday: authInfo.usedToday,
        dailyLimit: authInfo.dailyLimit,
        avatars: AVATARS.length,
      });
    }

    if (req.method === "GET" && req.url === "/api/avatars") {
      return sendJSON(req, res, 200, AVATARS);
    }

    // Both AI routes sit behind the same gate.
    if (req.method === "POST" && (req.url === "/api/ai" || req.url === "/api/banter")) {
      const access = checkAccess(req);
      if (!access.ok) return sendJSON(req, res, access.status, { error: access.error });

      const body = await readBody(req);

      if (req.url === "/api/banter") {
        const { line } = await banter({
          event: String(body.event ?? "").slice(0, 600),
          recent: (Array.isArray(body.recent) ? body.recent : []).map((s) => String(s).slice(0, 160)),
        });
        return sendJSON(req, res, 200, { line });
      }

      const message = String(body.message ?? "").trim();
      if (!message) return sendJSON(req, res, 400, { error: "אין הודעה" });

      // Never trust the config the browser sends, either.
      const { config } = sanitize(body.config, { avatarCount: AVATARS.length });

      const result = await askAI({
        message,
        config,
        history: Array.isArray(body.history) ? body.history : [],
        avatarCount: AVATARS.length,
      });
      return sendJSON(req, res, 200, result);
    }

    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405).end("method not allowed");
  } catch (error) {
    console.error("[error]", error);
    // The child should see Hebrew, not a stack trace.
    const friendly =
      error?.status === 401
        ? "המפתח של ה-AI לא מוגדר בשרת. צריך לבקש מהמדריך לתקן."
        : error?.status === 429
          ? "יש עומס רגע. תנסה/י שוב עוד כמה שניות."
          : "משהו השתבש בדרך ל-AI. תנסה/י שוב.";
    sendJSON(req, res, 500, { error: friendly });
  }
});

server.listen(PORT, () => {
  const nets = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);

  console.log("");
  console.log("  🎮  סדנת AI לילדים — השרת רץ");
  console.log("");
  console.log(`  על המחשב הזה:   http://localhost:${PORT}`);
  for (const ip of nets) console.log(`  מהטלפון/טאבלט: http://${ip}:${PORT}`);
  console.log("");
  console.log(`  מודל: ${aiInfo.model}`);
  console.log(
    `  קודי סדנה: ${authInfo.requiresCode ? `${authInfo.codes} קודים` : "לא נדרשים (מצב מקומי)"}`,
  );
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log("  ⚠️  ANTHROPIC_API_KEY לא מוגדר — פאנל ה-AI לא יעבוד.");
  }
  console.log("");
});
