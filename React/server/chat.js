// Plant assistant chat: answers plant questions with Gemini, using the live sensor values
// and the care plan of "My plant" (if one is set).

import { generate } from "./gemini.js";
import { getCurrentPlant } from "./plant.js";

const MAX_OUTPUT_TOKENS = 2048; // includes the model's thinking tokens; the answer itself stays short (see prompt)
const MAX_HISTORY_MESSAGES = 10; // older chat messages are not sent again
const MAX_MESSAGE_CHARS = 1000;

const LANGUAGE_NAMES = { en: "English", de: "German", nl: "Dutch" };

const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** One line about the weather (sent by the dashboard from Open-Meteo), or null. */
function weatherLine(weather) {
  const next = weather?.next24h;
  if (!next || finite(next.min) === null || finite(next.max) === null) return null;
  const place = typeof weather.place === "string" ? weather.place.slice(0, 80) : "the garden";
  const now = finite(weather.now?.temperature) !== null ? `now ${weather.now.temperature} °C, ${String(weather.now.sky).slice(0, 20)}; ` : "";
  return (
    `Weather forecast for ${place} (the plant is ${weather.outdoors ? "OUTSIDE" : "inside"}): ${now}` +
    `next 24 h ${next.min}-${next.max} °C, ${finite(next.rainMm) ?? 0} mm rain, gusts up to ${finite(next.maxGusts) ?? 0} km/h` +
    `${next.thunderstorm === true ? ", THUNDERSTORM expected" : ""}${next.snow === true ? ", SNOW expected" : ""}. ` +
    "Use it for questions about putting the plant outside, watering after rain, or protecting it."
  );
}

/** Instructions for the model, including the live sensor values, the user's plant and the weather. */
function systemPrompt(lang, sensors, weather) {
  const readings = [
    finite(sensors.temperature) !== null && `- Air temperature: ${sensors.temperature} °C (DHT11 sensor)`,
    finite(sensors.humidity) !== null && `- Air humidity: ${sensors.humidity} %`,
    finite(sensors.moisture) !== null &&
      `- Soil moisture: ${sensors.moisture} % (capacitive sensor; 0 % = dry air, 100 % = in water)`,
    finite(sensors.light) !== null &&
      `- Brightness: ${sensors.light} % (simple light sensor; 0 % = dark, 100 % = direct sun; a dark room reads about 35-40 %)`,
  ].filter(Boolean);

  const plant = getCurrentPlant();
  const plantInfo = plant
    ? [
        `The plant in this garden is: ${plant.name.en} (the user typed "${plant.input}").`,
        `Its healthy ranges on these sensors: soil moisture ${plant.ranges.moisture.min}-${plant.ranges.moisture.max} %, ` +
          `brightness ${plant.ranges.light.min}-${plant.ranges.light.max} %, ` +
          `temperature ${plant.ranges.temperature.min}-${plant.ranges.temperature.max} °C, ` +
          `air humidity ${plant.ranges.humidity.min}-${plant.ranges.humidity.max} %.`,
        `Watering: ${plant.watering.en} Sunlight: ${plant.sunlight.en}`,
        "Compare the readings with these ranges when the user asks about their plant.",
      ].join("\n")
    : "The user hasn't said which plant grows in the garden yet.";

  return [
    'You are the friendly plant assistant of "Smart Garden", a student hackathon project with sensors in a small garden.',
    "Give practical tips about plants: watering, light, temperature, humidity, soil, fertilizer, pests, and which plants suit which conditions.",
    `Always answer in ${LANGUAGE_NAMES[lang]}.`,
    "Keep answers short (at most about 150 words), in simple words. Use a short bullet list when it helps.",
    "If a question is not about plants or gardening, say politely that you only help with plants.",
    `The local time in the garden is ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. ` +
      "At night low brightness is normal - don't call it a problem then.",
    plantInfo,
    weatherLine(weather) ?? "No weather forecast available (no garden location set).",
    readings.length > 0
      ? `Current sensor readings from the garden:\n${readings.join("\n")}\nUse them when the user asks about their garden or plants, and point out values that look unusual. Never invent readings that are not listed.`
      : "No live sensor readings are available right now. If the user asks about their garden, say that the sensors are not sending data.",
  ].join("\n\n");
}

/** Checks what the browser sent. Returns the cleaned-up request or null. */
function parseChatRequest(body) {
  const lang = body?.lang in LANGUAGE_NAMES ? body.lang : "en";
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_MESSAGE_CHARS) }));

  // Gemini needs the conversation to start with the user and end with the new question
  while (messages.length > 0 && messages[0].role !== "user") messages.shift();
  if (messages.length === 0 || messages.at(-1).role !== "user") return null;

  const sensors = typeof body?.sensors === "object" && body.sensors !== null ? body.sensors : {};
  const weather = typeof body?.weather === "object" && body.weather !== null ? body.weather : null;
  return { lang, messages, sensors, weather };
}

/** POST /api/chat - returns { status, body } for server/api.js. */
export async function chat(body) {
  const request = parseChatRequest(body);
  if (!request) return { status: 400, body: { error: "bad_request" } };

  const result = await generate({
    system: systemPrompt(request.lang, request.sensors, request.weather),
    contents: request.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  if (result.text) return { status: 200, body: { reply: result.text } };
  const status = result.error.startsWith("limit") ? 429 : result.error === "busy" ? 503 : result.error === "no_key" ? 500 : 502;
  return { status, body: { error: result.error, retryAfter: result.retryAfter } };
}
