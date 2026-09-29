import mqtt from "mqtt";
import { useEffect, useState } from "react";
import { HISTORY_LIMIT, HISTORY_MAX_AGE_MS, MQTT_URL, TOPICS } from "../config";

export type ConnectionStatus = "connecting" | "connected" | "offline";

/** One reading: t = arrival time (ms), v = value */
export interface Point {
  t: number;
  v: number;
}

/** Reading from an ESP32 analog sensor: v = percent, plus the measured voltage and raw ADC value */
export interface AnalogPoint extends Point {
  voltage: number | null;
  raw: number | null;
}

export interface GardenData {
  temperature: Point[];
  humidity: Point[];
  moisture: AnalogPoint[];
  light: AnalogPoint[];
}

const EMPTY: GardenData = { temperature: [], humidity: [], moisture: [], light: [] };
// v2: light changed from "LIGHT"/"DARK" to a percentage - older saved data is ignored
const STORAGE_KEY = "sg-history-v2";

/** Readings saved by the last visit, so a page reload doesn't start with empty charts. */
function loadHistory(): GardenData {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<GardenData> | null;
    if (!saved) return EMPTY;
    const now = Date.now();
    const minTime = now - HISTORY_MAX_AGE_MS;
    // keep only readings that are recent, not from the future, and have the expected shape (never trust saved data)
    const recent = <T extends Point>(list: T[] | undefined) =>
      Array.isArray(list)
        ? list.filter((p) => typeof p?.t === "number" && Number.isFinite(p.v) && p.t >= minTime && p.t <= now + 60_000)
        : [];
    return {
      temperature: recent(saved.temperature),
      humidity: recent(saved.humidity),
      moisture: recent(saved.moisture),
      light: recent(saved.light),
    };
  } catch {
    return EMPTY;
  }
}

/** Add an item and keep only the newest HISTORY_LIMIT items. */
function append<T extends Point>(list: T[], item: T): T[] {
  // If the device clock jumped back (e.g. a Raspberry Pi syncing its time after a reboot),
  // older readings now look like they're "from the future" - drop them so charts and alerts stay correct
  const clean = list.length > 0 && list[list.length - 1].t > item.t ? list.filter((p) => p.t <= item.t) : list;
  return [...clean.slice(-(HISTORY_LIMIT - 1)), item];
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n : null;
}

/**
 * Reads the ESP32's JSON, e.g. {"moisture": 80.5, "voltage": 1.41, "raw": 27974}.
 * `valueField` is the percentage field ("moisture" or "percent"). Returns null if unreadable.
 */
function parseAnalog(payload: string, valueField: string, t: number): AnalogPoint | null {
  try {
    const json: unknown = JSON.parse(payload);
    const fields = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
    const v = typeof json === "number" ? json : Number(fields[valueField]);
    if (!Number.isFinite(v)) return null;
    return { t, v, voltage: toNumberOrNull(fields.voltage), raw: toNumberOrNull(fields.raw) };
  } catch {
    return null;
  }
}

/** Apply one MQTT message to the data. Returns null for messages we don't understand. */
function applyMessage(data: GardenData, topic: string, payload: string, t: number): GardenData | null {
  switch (topic) {
    case TOPICS.temperature: {
      const v = Number.parseFloat(payload);
      return Number.isFinite(v) ? { ...data, temperature: append(data.temperature, { t, v }) } : null;
    }
    case TOPICS.humidity: {
      const v = Number.parseFloat(payload);
      return Number.isFinite(v) ? { ...data, humidity: append(data.humidity, { t, v }) } : null;
    }
    case TOPICS.moisture: {
      // ESP32: {"moisture": 80.5, "voltage": 1.41, "raw": 27974}
      const point = parseAnalog(payload, "moisture", t);
      return point ? { ...data, moisture: append(data.moisture, point) } : null;
    }
    case TOPICS.light: {
      // ESP32: {"percent": 37.6, "voltage": 2.06, "raw": 40924}  (0 % = dark, 100 % = very bright)
      const point = parseAnalog(payload, "percent", t);
      return point ? { ...data, light: append(data.light, point) } : null;
    }
    default:
      return null;
  }
}

/** Connects to the MQTT broker and collects every sensor reading. */
export function useGardenData() {
  const [data, setData] = useState<GardenData>(loadHistory);
  // status + when it last changed (e.g. "offline since 00:21")
  const [connection, setConnection] = useState({ status: "connecting" as ConnectionStatus, since: Date.now() });
  const setStatus = (status: ConnectionStatus) =>
    setConnection((prev) => (prev.status === status ? prev : { status, since: Date.now() }));

  useEffect(() => {
    const client = mqtt.connect(MQTT_URL, {
      clientId: `smartgarden-dashboard-${Math.random().toString(16).slice(2, 10)}`,
      connectTimeout: 5_000,
      reconnectPeriod: 3_000, // retry every 3 s if the broker is down
    });

    // Ignore events from a client that was already shut down (React runs effects twice in dev mode)
    let active = true;

    client.on("connect", () => {
      if (!active) return;
      setStatus("connected");
      client.subscribe("smartgarden/#"); // all Smart Garden topics
    });
    client.on("close", () => {
      if (active) setStatus("offline"); // also fires after every failed reconnect attempt
    });
    client.on("error", (error) => console.warn("MQTT:", error.message));
    client.on("message", (topic, message) => {
      if (!active) return;
      const payload = message.toString();
      const receivedAt = Date.now();
      setData((prev) => applyMessage(prev, topic, payload, receivedAt) ?? prev);
    });

    return () => {
      active = false;
      client.end(true);
    };
  }, []);

  // Save the readings so they survive a page reload
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full or blocked - the dashboard still works without it
    }
  }, [data]);

  return { data, status: connection.status, statusSince: connection.since };
}
