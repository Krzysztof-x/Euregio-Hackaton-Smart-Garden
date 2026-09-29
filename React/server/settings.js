// Garden settings shared by every device: where the garden is (for the weather) and whether
// the plant is outside or inside. Saved in server/settings.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./gemini.js";

const SETTINGS_FILE = process.env.SETTINGS_FILE || join(DATA_DIR, "settings.json");
const DEFAULTS = { location: null, outdoors: true };

let settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.warn("Could not save settings:", error.message);
  }
}

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** A place from the Open-Meteo search (or "my location"). Returns null if it isn't valid. */
function cleanLocation(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    name: text(value.name, 80) || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    admin1: text(value.admin1, 80),
    country: text(value.country, 80),
    latitude: Math.round(latitude * 1000) / 1000, // ~100 m is plenty for the weather
    longitude: Math.round(longitude * 1000) / 1000,
  };
}

/** GET /api/settings */
export function getSettings() {
  return { status: 200, body: { settings } };
}

/** POST /api/settings - { location?, outdoors? } (only the given fields change) */
export function updateSettings(body) {
  if (body === null || typeof body !== "object") return { status: 400, body: { error: "bad_request" } };
  const next = { ...settings };

  if ("location" in body) {
    if (body.location === null) next.location = null;
    else {
      const location = cleanLocation(body.location);
      if (!location) return { status: 400, body: { error: "bad_request" } };
      next.location = location;
    }
  }
  if ("outdoors" in body) next.outdoors = body.outdoors === true;

  settings = next;
  saveSettings();
  return { status: 200, body: { settings } };
}
