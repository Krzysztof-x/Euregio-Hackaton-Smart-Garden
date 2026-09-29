// All settings of the dashboard live here.

/**
 * WebSocket address of the MQTT broker. Browsers can't use normal MQTT (port 1883),
 * so the dashboard uses the WebSocket listener from mosquitto.conf (port 9001).
 * Can be changed without touching code via VITE_MQTT_URL in a .env file.
 */
export const MQTT_URL: string = import.meta.env.VITE_MQTT_URL || "ws://192.168.1.192:9001";

/** Address of the Raspberry Pi (only shown in the device list). */
export const PI_HOST = "192.168.1.45";

/** Topics published by rpi/smart_garden_mqtt.py (Pi) and esp32_soil/main.py (ESP32) */
export const TOPICS = {
  temperature: "smartgarden/temperature", // Pi: "21.6"
  humidity: "smartgarden/humidity", // Pi: "71"
  moisture: "smartgarden/moisture", // ESP32: {"moisture": 80.5, "voltage": 1.41, "raw": 27974}
  light: "smartgarden/light", // ESP32: {"percent": 37.6, "voltage": 2.06, "raw": 40924}
} as const;

/** A sensor counts as offline when nothing arrived for this long (Pi sends every 10 s, ESP32 every 5 s). */
export const STALE_AFTER_MS = 30_000;

/** Readings kept per sensor (~2 h of Pi data, ~1 h of ESP32 data). */
export const HISTORY_LIMIT = 720;

/** Saved readings older than this are dropped when the page is opened again. */
export const HISTORY_MAX_AGE_MS = 2 * 60 * 60_000;

/** A pause longer than this between two readings breaks the chart line (the sensor was offline). */
export const CHART_GAP_MS = 60_000;

/** Soil moisture in % when no plant is set: below DRY = too dry, above WET = very wet, in between = good. */
export const MOISTURE_DRY_BELOW = 30;
export const MOISTURE_WET_ABOVE = 70;

/** Notifications: light uses the average of this long, so a passing cloud or shadow doesn't count. */
export const LIGHT_AVERAGE_MS = 5 * 60_000;

/** Light is only judged during the day (local time, hours) - at night every plant is "too dark". */
export const LIGHT_CHECK_HOURS = { from: 9, to: 18 } as const;

/** A device counts as "not sending" after this long without data (Pi sends every 5-10 s, ESP32 every 5 s). */
export const OFFLINE_AFTER_MS = 60_000;

/** After the page (re)connects to the broker, wait this long for fresh data before judging the devices. */
export const FIRST_DATA_GRACE_MS = 15_000;

/** Warn about the broker after the dashboard couldn't reach it for this long. */
export const BROKER_OFFLINE_AFTER_MS = 30_000;

/**
 * A problem only counts as solved after it has been gone this long. Stops a value that jumps
 * around a limit (24.9 -> 25.1 -> 24.9 %) from sending a new notification every few seconds.
 */
export const ALERT_SOLVED_AFTER_MS = 3 * 60_000;

/** If a problem isn't fixed, remind again after this long. */
export const ALERT_REMIND_MS = 6 * 60 * 60_000;
