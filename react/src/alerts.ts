import {
  BROKER_OFFLINE_AFTER_MS,
  CHART_GAP_MS,
  FIRST_DATA_GRACE_MS,
  LIGHT_AVERAGE_MS,
  LIGHT_CHECK_HOURS,
  OFFLINE_AFTER_MS,
  STALE_AFTER_MS,
} from "./config";
import type { ConnectionStatus, GardenData, Point } from "./hooks/useGardenData";
import { METRICS, type Metric, type PlantProfile, type Range } from "./plant";
import type { WeatherAdvice } from "./weather";

export type Device = "pi" | "esp32";

/** Which sensors each device sends. */
export const DEVICE_METRICS: Record<Device, Metric[]> = {
  pi: ["temperature", "humidity"],
  esp32: ["moisture", "light"],
};

/** Something that needs attention. `id` stays the same while it's the same problem. */
export type Alert =
  /** a value is outside the plant's range, e.g. "moisture-high" */
  | { kind: "range"; id: string; metric: Metric; direction: "low" | "high"; value: number; range: Range; since: number }
  /** a device stopped sending some or all of its sensors; since = last data (null = none received yet) */
  | { kind: "offline"; id: string; device: Device; metrics: Metric[]; since: number | null }
  /** the dashboard can't reach the MQTT broker at all */
  | { kind: "broker"; id: "broker"; since: number }
  /** a weather warning for a plant that is outside, e.g. a thunderstorm */
  | { kind: "weather"; id: string; advice: WeatherAdvice };

/** Weather warnings (not the "all good" infos) become alerts - only when the plant is outside. */
export function weatherAlerts(advice: WeatherAdvice[], outdoors: boolean): Alert[] {
  if (!outdoors) return [];
  return advice
    .filter((item) => item.severity !== "info")
    .map((item) => ({ kind: "weather" as const, id: `weather-${item.id}`, advice: item }));
}

/** Light is only judged during the day - at night every plant is "too dark". */
export function isLightCheckTime(now: number): boolean {
  const hour = new Date(now).getHours();
  return hour >= LIGHT_CHECK_HOURS.from && hour < LIGHT_CHECK_HOURS.to;
}

/** Average of the readings since `from` (at least the newest one). */
function averageSince(points: Point[], from: number): number {
  const recent = points.filter((p) => p.t >= from);
  const list = recent.length > 0 ? recent : points.slice(-1);
  return list.reduce((sum, p) => sum + p.v, 0) / list.length;
}

/**
 * Checks everything that should notify the user - no AI needed, runs every second:
 * 1. broker unreachable, 2. devices that stopped sending, 3. values outside the plant's ranges (instantly).
 */
export function findAlerts(
  data: GardenData,
  plant: PlantProfile | null,
  status: ConnectionStatus,
  statusSince: number,
  now: number,
): Alert[] {
  // 1. No broker = no data at all. Then that's the one thing to report (not every sensor separately).
  if (status !== "connected") {
    return now - statusSince >= BROKER_OFFLINE_AFTER_MS ? [{ kind: "broker", id: "broker", since: statusSince }] : [];
  }

  const alerts: Alert[] = [];

  // 2. Devices that stopped sending: no reading for OFFLINE_AFTER_MS. Right after (re)connecting we
  //    give the devices FIRST_DATA_GRACE_MS to send something fresh - then the saved history counts,
  //    so a device that has been silent for minutes is reported right away.
  const connectedFor = now - statusSince;
  for (const device of ["pi", "esp32"] as const) {
    const missing = DEVICE_METRICS[device].filter((metric) => {
      const lastTime = data[metric].at(-1)?.t;
      if (lastTime === undefined) return connectedFor > OFFLINE_AFTER_MS; // never received anything
      return now - lastTime > OFFLINE_AFTER_MS && connectedFor > FIRST_DATA_GRACE_MS;
    });
    if (missing.length > 0) {
      const lastTimes = missing.map((metric) => data[metric].at(-1)?.t).filter((t) => t !== undefined);
      alerts.push({
        kind: "offline",
        id: `offline-${device}`,
        device,
        metrics: missing,
        since: lastTimes.length > 0 ? Math.max(...lastTimes) : null,
      });
    }
  }

  // 3. The plant's ranges - notified instantly when the current value is outside
  if (!plant) return alerts;
  for (const metric of METRICS) {
    const points = data[metric];
    const last = points.at(-1);
    if (!last || now - last.t > STALE_AFTER_MS) continue; // no current data - reported as offline above
    if (metric === "light" && !isLightCheckTime(now)) continue;

    const range = plant.ranges[metric];
    // Light: 5-minute average, so a passing cloud or shadow doesn't count
    const value = metric === "light" ? averageSince(points, now - LIGHT_AVERAGE_MS) : last.v;
    const direction = value < range.min ? "low" : value > range.max ? "high" : null;
    if (!direction) continue;

    // Since when? Go back while the value stayed outside on the same side (and the sensor didn't pause)
    const outside = (v: number) => (direction === "low" ? v < range.min : v > range.max);
    let since = last.t;
    for (let i = points.length - 2; i >= 0; i--) {
      if (!outside(points[i].v) || points[i + 1].t - points[i].t > CHART_GAP_MS) break;
      since = points[i].t;
    }

    alerts.push({ kind: "range", id: `${metric}-${direction}`, metric, direction, value, range, since });
  }
  return alerts;
}
