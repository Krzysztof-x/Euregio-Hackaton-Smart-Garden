import { useEffect, useState } from "react";
import type { Alert } from "../alerts";
import { ALERT_REMIND_MS, ALERT_SOLVED_AFTER_MS } from "../config";
import { useI18n } from "../i18n/context";
import type { TextKey } from "../i18n/translations";
import { METRIC_DIGITS, METRIC_UNITS, type PlantProfile } from "../plant";
import { useAdviceText } from "./useWeather";

const RANGE_TITLES: Record<string, TextKey> = {
  "moisture-low": "alertMoistureLow",
  "moisture-high": "alertMoistureHigh",
  "temperature-low": "alertTemperatureLow",
  "temperature-high": "alertTemperatureHigh",
  "humidity-low": "alertHumidityLow",
  "humidity-high": "alertHumidityHigh",
  "light-low": "alertLightLow",
  "light-high": "alertLightHigh",
};

const RANGE_ADVICE: Record<string, TextKey> = {
  "moisture-low": "adviceMoistureLow",
  "moisture-high": "adviceMoistureHigh",
  "temperature-low": "adviceTemperatureLow",
  "temperature-high": "adviceTemperatureHigh",
  "humidity-low": "adviceHumidityLow",
  "humidity-high": "adviceHumidityHigh",
  "light-low": "adviceLightLow",
  "light-high": "adviceLightHigh",
};

/** Title + text of an alert in the current language, e.g. "Soil too wet" / "Soil moisture 89 % – ideal for …". */
export function useAlertText() {
  const { t, lang, formatNumber, formatTime } = useI18n();
  const adviceText = useAdviceText();

  return (alert: Alert, plant: PlantProfile | null): { title: string; body: string } => {
    switch (alert.kind) {
      case "range": {
        const unit = ` ${METRIC_UNITS[alert.metric]}`; // non-breaking space: "5–25 %" never splits
        const body = t("alertBody", {
          metric: t(alert.metric),
          value: `${formatNumber(alert.value, METRIC_DIGITS[alert.metric])}${unit}`,
          plant: plant?.name[lang] ?? "",
          range: `${alert.range.min}–${alert.range.max}${unit}`,
        });
        return { title: t(RANGE_TITLES[alert.id]), body: `${body} ${t(RANGE_ADVICE[alert.id])}` };
      }
      case "offline": {
        const sensors = alert.metrics.map((metric) => t(metric)).join(", ");
        const missing =
          alert.since === null
            ? t("alertOfflineNever", { sensors })
            : t("alertOfflineSince", { sensors, time: formatTime(alert.since) });
        const isPi = alert.device === "pi";
        return {
          title: t(isPi ? "alertPiOffline" : "alertEspOffline"),
          body: `${missing} ${t(isPi ? "advicePiOffline" : "adviceEspOffline")}`,
        };
      }
      case "broker":
        return { title: t("alertBrokerOffline"), body: t("alertBrokerBody", { time: formatTime(alert.since) }) };
      case "weather":
        return adviceText(alert.advice, plant, Date.now());
    }
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationPermissionState = NotificationPermission | "unsupported";

export interface Toast {
  id: number;
  title: string;
  body: string;
  /** serious problems (device down, broker offline, storm) stay until the user closes them */
  sticky: boolean;
}

const isSerious = (alert: Alert) =>
  alert.kind === "offline" || alert.kind === "broker" || (alert.kind === "weather" && alert.advice.severity === "critical");

/** What was already notified: per alert when we notified (`at`) and when it was last active (`seen`). */
interface SentStore {
  plant: number | null; // createdAt of the plant - a new plant means everything is news again
  alerts: Record<string, { at: number; seen: number }>;
}

const SENT_KEY = "sg-notified-v2";
const TOAST_MS = 12_000;

function loadSent(): SentStore {
  try {
    const saved = JSON.parse(localStorage.getItem(SENT_KEY) ?? "null") as SentStore | null;
    if (saved && typeof saved.alerts === "object") return saved;
  } catch {
    // broken or blocked storage - start fresh
  }
  return { plant: null, alerts: {} };
}

function saveSent(store: SentStore) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(store));
  } catch {
    // not saved - worst case a notification repeats after a reload
  }
}

function showSystemNotification(title: string, body: string, tag: string) {
  try {
    new Notification(title, { body, tag, icon: "/favicon.svg" });
  } catch {
    // some mobile browsers only allow notifications from an installed app - the toast still shows
  }
}

/**
 * Notifies about every NEW problem immediately - as a toast in the page (works everywhere) and as a
 * system pop-up (only on https / localhost, after the user allowed it).
 * - "New" = not reported yet, or it was solved (gone for ALERT_SOLVED_AFTER_MS) and came back.
 * - A different plant = everything is new again, so you get its full current state.
 * - Still not fixed after ALERT_REMIND_MS -> reminder.
 * - Several new problems at once -> one combined message.
 */
export function useAlertNotifications(alerts: Alert[], plant: PlantProfile | null, ready: boolean, now: number) {
  const { t, lang } = useI18n();
  const describe = useAlertText();
  const supported = typeof Notification !== "undefined" && window.isSecureContext;
  const [permission, setPermission] = useState<NotificationPermissionState>(
    supported ? Notification.permission : "unsupported",
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  /** One message for one or more alerts. */
  function message(list: Alert[]): { title: string; body: string } {
    if (list.length === 1) {
      const { title, body } = describe(list[0], plant);
      const aboutPlant = (list[0].kind === "range" || list[0].kind === "weather") && plant;
      return { title: aboutPlant ? `${plant.name[lang]}: ${title}` : title, body };
    }
    return {
      title: `${plant ? plant.name[lang] : "Smart Garden"}: ${t("notifyMany", { count: list.length })}`,
      body: list.map((alert) => describe(alert, plant).title).join(" · "),
    };
  }

  function notify(list: Alert[], tag: string) {
    const { title, body } = message(list);
    const sticky = list.some(isSerious);
    setToasts((prev) => [...prev.slice(-2), { id: Date.now() + Math.random(), title, body, sticky }]);
    if (permission === "granted") showSystemNotification(title, body, tag);
  }

  const activeKey = alerts.map((a) => a.id).join(",");
  const tick = Math.floor(now / 10_000); // re-check every 10 s (reminders, "solved")
  const plantKey = plant?.createdAt ?? null;

  useEffect(() => {
    if (!ready) return; // wait until we know which plant is set
    const time = Date.now();
    let store = loadSent();
    if (store.plant !== plantKey) store = { plant: plantKey, alerts: {} }; // new plant -> report its full state

    const fresh: Alert[] = [];
    for (const alert of alerts) {
      const record = store.alerts[alert.id];
      const isNew = !record || time - record.seen > ALERT_SOLVED_AFTER_MS || time - record.at > ALERT_REMIND_MS;
      if (isNew) fresh.push(alert);
      store.alerts[alert.id] = { at: isNew ? time : record.at, seen: time };
    }
    // Forget problems that have been gone long enough - they are solved
    for (const [id, record] of Object.entries(store.alerts)) {
      if (time - record.seen > ALERT_SOLVED_AFTER_MS) delete store.alerts[id];
    }
    saveSent(store);

    if (fresh.length > 0) notify(fresh, fresh.map((a) => a.id).join(","));
    // (`alerts` is covered by activeKey; message texts are rebuilt every render, so they're left out on purpose)
  }, [activeKey, tick, ready, plantKey]);

  // Normal toasts disappear by themselves; serious ones stay until closed
  useEffect(() => {
    const next = toasts.find((toast) => !toast.sticky);
    if (!next) return;
    const id = setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== next.id)), TOAST_MS);
    return () => clearTimeout(id);
  }, [toasts]);

  // The browser tab shows the number of problems, e.g. "(2) Smart Garden"
  useEffect(() => {
    document.title = alerts.length > 0 ? `(${alerts.length}) Smart Garden` : "Smart Garden";
  }, [alerts.length]);

  /** Asks the browser for permission and confirms with a first notification of the current state. */
  async function enable() {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;
    const { title, body } = alerts.length > 0 ? message(alerts) : { title: t("notifyEnabled"), body: t("notifyAllGood") };
    showSystemNotification(title, body, "enabled");
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  return { permission, enable, toasts, dismissToast };
}
