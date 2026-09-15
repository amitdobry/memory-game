// ---------------------------------------------------------------------------
// A static file server, and deliberately nothing more.
//
// There is no API here and no credential here. Everything this app asks of an AI
// goes to LIVE's /api/workshop/* endpoints, which hold the Anthropic key — see
// public/js/api.js for the address and the workshop README for why.
//
// This file exists for two conveniences and would be correct to delete:
//   * `npm start` during development;
//   * workshop day on a laptop, where the room connects to the LAN address this
//     prints and nothing needs hosting.
//
// The site itself is plain static files. Any static host serves it — GitHub Pages
// included — with no build step.
// ---------------------------------------------------------------------------
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PORT = Number(process.env.PORT ?? 3000);

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

const server = http.createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" }).end("read-only");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const rel = decodeURIComponent(url.pathname) === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.join(PUBLIC_DIR, rel);

  // Never serve anything outside public/.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("לא נמצא");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      // Pictures can cache hard; pages must not, so an edit shows up on reload.
      "cache-control": ext === ".webp" ? "public, max-age=86400" : "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);

  console.log("\n  🎮  סדנת AI לילדים — אתר סטטי\n");
  console.log(`  על המחשב הזה:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  מהטלפון/טאבלט: http://${ip}:${PORT}`);
  console.log("\n  ה-AI רץ בשרת נפרד (LIVE). ראו public/js/api.js\n");
});
