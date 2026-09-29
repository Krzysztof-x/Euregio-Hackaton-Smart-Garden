// Everything that talks to Google Gemini: model settings, the free-limit counter and the request itself.
// Chat questions and plant care plans share the same limits (Google counts them together too).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(); // GEMINI_API_KEY and optional settings from .env (existing env vars win)
} catch {
  // no .env file - requests answer with "no_key"
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// gemini-2.5-flash is no longer available to new API keys - Google points to gemini-3.8-flash instead
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Keep "thinking" as small as possible (faster, fewer tokens): Gemini 2.5 can switch it off,
// Gemini 3 and newer can't - "low" is their smallest level.
const THINKING_CONFIG = MODEL.startsWith("gemini-2.5") ? { thinkingBudget: 0 } : { thinkingLevel: "low" };

// Free-tier safety limits, counted for ALL users and features together. Google doesn't publish one
// fixed free limit anymore - check yours at https://aistudio.google.com/rate-limit and only raise
// these (in .env) if your project really allows more.
const LIMIT_PER_MINUTE = Number(process.env.CHAT_LIMIT_PER_MINUTE) || 5;
const LIMIT_PER_DAY = Number(process.env.CHAT_LIMIT_PER_DAY) || 20;

export const DATA_DIR = dirname(fileURLToPath(import.meta.url));

// Google resets the daily quota at midnight Pacific time, so we count days the same way
const USAGE_FILE = process.env.CHAT_USAGE_FILE || join(DATA_DIR, "usage.json");
const pacificDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(date); // "2026-09-28"

// ---------------------------------------------------------------------------
// Usage counting (saved to server/usage.json, so a restart doesn't reset the day)
// ---------------------------------------------------------------------------

let dayUsage = loadDayUsage();
let recentRequests = []; // timestamps of the requests in the last minute

function loadDayUsage() {
  try {
    const saved = JSON.parse(readFileSync(USAGE_FILE, "utf8"));
    // Same day - or a "later" day because the clock jumped back since: keep counting (safe side)
    if (saved.day >= pacificDay() && Number.isInteger(saved.count)) return saved;
  } catch {
    // no file yet
  }
  return { day: pacificDay(), count: 0 };
}

/**
 * Starts a new count only when the day moves FORWARD. If the computer's clock jumps back
 * (it happened during testing), the count is kept - so a clock glitch can never reset the limit.
 * Dates like "2026-09-28" can be compared as text.
 */
function currentDayUsage() {
  const today = pacificDay();
  if (today > dayUsage.day) dayUsage = { day: today, count: 0 };
  return dayUsage;
}

function saveDayUsage() {
  try {
    mkdirSync(dirname(USAGE_FILE), { recursive: true });
    writeFileSync(USAGE_FILE, JSON.stringify(dayUsage));
  } catch (error) {
    console.warn("Could not save AI usage:", error.message);
  }
}

/** Next midnight in Pacific time, as a timestamp (when Google resets the daily quota). */
function nextPacificMidnight() {
  const today = pacificDay();
  let t = Date.now();
  // step forward in 15 min steps until the Pacific date changes (simple and DST-proof)
  while (pacificDay(new Date(t)) === today) t += 15 * 60_000;
  return t - (t % (15 * 60_000));
}

export function getUsage() {
  const usage = currentDayUsage();
  return {
    usedToday: usage.count,
    limitPerDay: LIMIT_PER_DAY,
    remainingToday: Math.max(0, LIMIT_PER_DAY - usage.count),
    resetsAt: nextPacificMidnight(),
  };
}

/** Reserves one request if the limits allow it, otherwise says why not. */
function reserveRequest() {
  const now = Date.now();
  recentRequests = recentRequests.filter((t) => now - t < 60_000);

  if (getUsage().remainingToday <= 0) return { ok: false, error: "limit_day" };
  if (recentRequests.length >= LIMIT_PER_MINUTE) {
    const retryAfter = Math.ceil((60_000 - (now - recentRequests[0])) / 1000);
    return { ok: false, error: "limit_minute", retryAfter };
  }

  recentRequests.push(now);
  dayUsage.count += 1;
  saveDayUsage();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/**
 * Asks Gemini, but only if the free limits allow it.
 * `responseSchema` (optional) makes Gemini answer with JSON in exactly that shape.
 * Returns { text } or { error, retryAfter? }.
 */
export async function generate({ system, contents, maxOutputTokens, responseSchema }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "no_key" };

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      maxOutputTokens, // includes the model's thinking tokens
      thinkingConfig: THINKING_CONFIG,
      ...(responseSchema && { responseMimeType: "application/json", responseSchema }),
    },
  });

  let response;
  let data;
  // Google sometimes answers 503 "high demand" - try once more after a short pause.
  // Every attempt counts toward our limits, so the free-limit protection still holds.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const slot = reserveRequest();
    if (!slot.ok) return { error: slot.error, retryAfter: slot.retryAfter };

    try {
      response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      console.warn("Gemini request failed:", error.message);
      return { error: "upstream" };
    }

    if (response.status !== 503 || attempt === 2) break;
    console.warn("Gemini is busy (503), trying once more...");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  if (response.status === 429) return { error: "limit_google" };
  if (response.status === 503) return { error: "busy" };
  if (!response.ok) {
    console.warn(`Gemini error ${response.status}:`, data?.error?.message);
    return { error: "upstream" };
  }

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought) // skip the model's internal thoughts, if any are returned
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    console.warn("Gemini gave no answer, finishReason:", candidate?.finishReason);
    return { error: "no_answer" };
  }
  return { text };
}
