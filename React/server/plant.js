// "My plant": the AI creates a care plan with healthy sensor ranges ONCE per plant.
// The dashboard then compares the live sensor values with these ranges itself (no AI needed),
// so notifications never use up the free Gemini quota.
//
// The plan is saved in server/plant.json, so every device sees the same plant.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR, MODEL, generate } from "./gemini.js";

const PLANT_FILE = process.env.PLANT_FILE || join(DATA_DIR, "plant.json");
const MAX_NAME_CHARS = 60;

// What our cheap sensors read, so the AI can give ranges on the SAME scales.
// Adjust these if you calibrate the sensors differently.
const SENSOR_SCALES = `
- soilMoisture: % from a capacitive soil sensor. 0 % = completely dry (sensor in the air), 100 % = sensor in a glass of water.
- light: % from a simple light sensor (photoresistor). 0 % = completely dark, 100 % = direct bright sunlight. A dark room at night reads about 35-40 %.
- temperature: air temperature in °C.
- humidity: relative air humidity in %.`.trim();

const SYSTEM_PROMPT = `You are a horticulture expert for "Smart Garden", a student project where sensors watch one plant.
Create a care plan for the plant the user names. The garden has these sensors:
${SENSOR_SCALES}

For each sensor give the range (min and max) in which this plant is healthy, on exactly these scales.
Be specific to the plant: e.g. a cactus needs much drier soil and more light than a fern.
Texts must be short and practical:
- "watering": one sentence on how often and how much to water.
- "sunlight": one sentence on its light needs.
- "tips": 2-3 very short care tips.
- "name": the plant's common name.
Write every text in English (en), German (de) and Dutch (nl).
If the input is clearly not a plant, set "isPlant" to false.`;

// The exact JSON shape Gemini must answer with
const texts = {
  type: "OBJECT",
  properties: { en: { type: "STRING" }, de: { type: "STRING" }, nl: { type: "STRING" } },
  required: ["en", "de", "nl"],
};
const textLists = {
  type: "OBJECT",
  properties: {
    en: { type: "ARRAY", items: { type: "STRING" } },
    de: { type: "ARRAY", items: { type: "STRING" } },
    nl: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["en", "de", "nl"],
};
const range = {
  type: "OBJECT",
  properties: { min: { type: "NUMBER" }, max: { type: "NUMBER" } },
  required: ["min", "max"],
};
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isPlant: { type: "BOOLEAN" },
    name: texts,
    soilMoisture: range,
    light: range,
    temperature: range,
    humidity: range,
    watering: texts,
    sunlight: texts,
    tips: textLists,
  },
  required: ["isPlant", "name", "soilMoisture", "light", "temperature", "humidity", "watering", "sunlight", "tips"],
};

// ---------------------------------------------------------------------------
// Storage: the current plant + every plan created so far (asking for the same plant again is free)
// ---------------------------------------------------------------------------

let store = loadStore();

function loadStore() {
  try {
    const saved = JSON.parse(readFileSync(PLANT_FILE, "utf8"));
    return { current: saved.current ?? null, cache: saved.cache ?? {} };
  } catch {
    return { current: null, cache: {} };
  }
}

function saveStore() {
  try {
    mkdirSync(dirname(PLANT_FILE), { recursive: true });
    writeFileSync(PLANT_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.warn("Could not save the plant:", error.message);
  }
}

export function getCurrentPlant() {
  return store.current;
}

// ---------------------------------------------------------------------------
// Checking the AI's answer (never trust it blindly)
// ---------------------------------------------------------------------------

/** A sensible min/max inside the sensor's limits, at least `minWidth` apart. */
function cleanRange(value, low, high, minWidth) {
  let min = Math.min(high, Math.max(low, Number(value?.min)));
  let max = Math.min(high, Math.max(low, Number(value?.max)));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) [min, max] = [max, min];
  if (max - min < minWidth) {
    const middle = (min + max) / 2;
    min = Math.max(low, middle - minWidth / 2);
    max = Math.min(high, middle + minWidth / 2);
  }
  return { min: Math.round(min), max: Math.round(max) };
}

const cleanText = (value) => String(value ?? "").trim().slice(0, 400);

function cleanTexts(value) {
  return { en: cleanText(value?.en), de: cleanText(value?.de), nl: cleanText(value?.nl) };
}

function cleanList(value) {
  const list = (items) => (Array.isArray(items) ? items.map(cleanText).filter(Boolean).slice(0, 4) : []);
  return { en: list(value?.en), de: list(value?.de), nl: list(value?.nl) };
}

function buildPlant(json, input) {
  const ranges = {
    moisture: cleanRange(json.soilMoisture, 0, 100, 10),
    light: cleanRange(json.light, 0, 100, 10),
    temperature: cleanRange(json.temperature, -10, 50, 4),
    humidity: cleanRange(json.humidity, 0, 100, 10),
  };
  if (Object.values(ranges).some((r) => r === null)) return null;

  const name = cleanTexts(json.name);
  for (const lang of ["en", "de", "nl"]) if (!name[lang]) name[lang] = input;

  return {
    input,
    name,
    ranges,
    watering: cleanTexts(json.watering),
    sunlight: cleanTexts(json.sunlight),
    tips: cleanList(json.tips),
    model: MODEL,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Endpoints (called by server/api.js). Each returns { status, body }.
// ---------------------------------------------------------------------------

export function getPlant() {
  return { status: 200, body: { plant: store.current } };
}

export function deletePlant() {
  store.current = null;
  saveStore();
  return { status: 200, body: { plant: null } };
}

export async function createPlant(body) {
  const input = String(body?.name ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_CHARS);
  if (!input) return { status: 400, body: { error: "bad_request" } };

  // Same plant as before? Use the saved plan - costs no AI request
  const key = input.toLowerCase();
  if (store.cache[key]) {
    store.current = store.cache[key];
    saveStore();
    return { status: 200, body: { plant: store.current } };
  }

  const result = await generate({
    system: SYSTEM_PROMPT,
    contents: [{ role: "user", parts: [{ text: `Plant: ${JSON.stringify(input)}` }] }],
    maxOutputTokens: 4096,
    responseSchema: RESPONSE_SCHEMA,
  });
  if (result.error) {
    const status = result.error.startsWith("limit") ? 429 : result.error === "busy" ? 503 : result.error === "no_key" ? 500 : 502;
    return { status, body: { error: result.error, retryAfter: result.retryAfter } };
  }

  let json;
  try {
    json = JSON.parse(result.text);
  } catch {
    return { status: 502, body: { error: "no_answer" } };
  }
  if (json.isPlant === false) return { status: 422, body: { error: "not_a_plant" } };

  const plant = buildPlant(json, input);
  if (!plant) return { status: 502, body: { error: "no_answer" } };

  store.current = plant;
  store.cache[key] = plant;
  saveStore();
  return { status: 200, body: { plant } };
}
