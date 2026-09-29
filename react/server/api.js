// All /api/... routes. Used by the Vite dev server (vite.config.ts) and the production server (server/index.js).
//
//   GET    /api/chat/usage  -> how many AI requests are left today
//   POST   /api/chat        -> { messages, lang, sensors } -> { reply }
//   GET    /api/plant       -> { plant }  (the care plan of "My plant", or null)
//   POST   /api/plant       -> { name }   -> the AI creates a care plan -> { plant }
//   DELETE /api/plant       -> removes the plant
//   GET    /api/settings    -> { settings }  (garden location for the weather, plant outside/inside)
//   POST   /api/settings    -> { location?, outdoors? } -> { settings }
//
// Every response also contains `usage`, so the page always shows the remaining AI requests.

import { chat } from "./chat.js";
import { getUsage } from "./gemini.js";
import { createPlant, deletePlant, getPlant } from "./plant.js";
import { getSettings, updateSettings } from "./settings.js";

const MAX_BODY_BYTES = 32_000;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ...body, usage: getUsage() }));
}

/** Reads a JSON request body (max 32 kB). Returns null if it isn't valid JSON. */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too_large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

/** Handles /api/... requests. Returns false if the URL isn't an API URL. */
export async function handleApi(req, res) {
  const url = (req.url ?? "").split("?")[0];
  if (!url.startsWith("/api/")) return false;
  const route = `${req.method} ${url}`;

  try {
    let result;
    if (route === "GET /api/chat/usage") result = { status: 200, body: {} };
    else if (route === "POST /api/chat") result = await chat(await readJson(req));
    else if (route === "GET /api/plant") result = getPlant();
    else if (route === "POST /api/plant") result = await createPlant(await readJson(req));
    else if (route === "DELETE /api/plant") result = deletePlant();
    else if (route === "GET /api/settings") result = getSettings();
    else if (route === "POST /api/settings") result = updateSettings(await readJson(req));
    else result = { status: 404, body: { error: "not_found" } };
    sendJson(res, result.status, result.body);
  } catch (error) {
    console.warn(`${route} failed:`, error.message);
    sendJson(res, 500, { error: "server_error" });
  }
  return true;
}
