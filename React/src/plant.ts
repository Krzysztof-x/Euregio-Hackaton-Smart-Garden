import type { Language } from "./i18n/translations";

/** The 4 sensors a plant has target ranges for. */
export const METRICS = ["moisture", "light", "temperature", "humidity"] as const;
export type Metric = (typeof METRICS)[number];

export interface Range {
  min: number;
  max: number;
}

/** Care plan created by the AI (server/plant.js) - texts in all three languages. */
export interface PlantProfile {
  input: string;
  name: Record<Language, string>;
  ranges: Record<Metric, Range>;
  watering: Record<Language, string>;
  sunlight: Record<Language, string>;
  tips: Record<Language, string[]>;
  createdAt: number;
}

export type RangeStatus = "low" | "ok" | "high";

export function rangeStatus(value: number, range: Range): RangeStatus {
  if (value < range.min) return "low";
  if (value > range.max) return "high";
  return "ok";
}

export const METRIC_UNITS: Record<Metric, string> = {
  moisture: "%",
  light: "%",
  temperature: "°C",
  humidity: "%",
};

/** Decimal places shown per sensor (the DHT11 gives whole-number humidity). */
export const METRIC_DIGITS: Record<Metric, number> = {
  moisture: 1,
  light: 1,
  temperature: 1,
  humidity: 0,
};
