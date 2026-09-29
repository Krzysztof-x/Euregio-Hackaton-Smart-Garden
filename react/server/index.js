// Production server: serves the built dashboard (dist/) and the AI API (chat + plant care plan).
//
//   npm run build   (once, creates dist/)
//   npm start       (then open http://<this computer's IP>:8080)

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { handleApi } from "./api.js";

const PORT = Number(process.env.PORT) || 8080;
const DIST = resolve("dist");
const INDEX = join(DIST, "index.html");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const isFile = (path) => stat(path).then((s) => s.isFile(), () => false);

/** Finds the file in dist/ for a URL. Unknown paths (and "../" tricks) get index.html. */
async function resolveFile(url) {
  let path;
  try {
    path = normalize(join(DIST, decodeURIComponent(url.split("?")[0])));
  } catch {
    return INDEX; // malformed URL
  }
  if (!path.startsWith(DIST + sep)) return INDEX;
  return (await isFile(path)) ? path : INDEX;
}

createServer(async (req, res) => {
  if (await handleApi(req, res)) return;

  const file = await resolveFile(req.url ?? "/");
  if (!(await isFile(file))) {
    res.statusCode = 500;
    res.end("dist/ not found - run 'npm run build' first.");
    return;
  }
  res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
  // Built files have a hash in their name, so browsers may keep them forever
  if (file.startsWith(join(DIST, "assets") + sep)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Smart Garden dashboard: http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is missing in .env - the plant assistant won't answer.");
});
