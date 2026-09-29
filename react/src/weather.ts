// Weather from Open-Meteo (free, no API key) + plant-specific weather tips. No AI involved.

import type { PlantProfile } from "./plant";

/** A place from the Open-Meteo search (stored on the server in settings.json). */
export interface GardenLocation {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface HourForecast {
  time: number; // ms
  temperature: number;
  rainChance: number; // %
  rain: number; // mm in this hour
  code: number; // WMO weather code
  gusts: number; // km/h
  uv: number;
  isDay: boolean;
}

export interface DayForecast {
  time: number; // local midnight, ms
  code: number;
  max: number;
  min: number;
  rain: number; // mm
  rainChance: number; // %
}

export interface Forecast {
  fetchedAt: number;
  current: { temperature: number; humidity: number; code: number; wind: number; gusts: number; isDay: boolean };
  hourly: HourForecast[];
  daily: DayForecast[];
}

// ---------------------------------------------------------------------------
// Open-Meteo API
// ---------------------------------------------------------------------------

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** Weather now + the next 3 days (hourly and daily). */
export async function fetchForecast(location: GardenLocation, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day",
    hourly: "temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,uv_index,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    timezone: "auto",
    timeformat: "unixtime", // times as seconds since 1970 - no time zone parsing needed
    forecast_days: "3",
  });
  const response = await fetch(`${FORECAST_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  const j = await response.json();

  return {
    fetchedAt: Date.now(),
    current: {
      temperature: num(j.current?.temperature_2m),
      humidity: num(j.current?.relative_humidity_2m),
      code: num(j.current?.weather_code),
      wind: num(j.current?.wind_speed_10m),
      gusts: num(j.current?.wind_gusts_10m),
      isDay: j.current?.is_day === 1,
    },
    hourly: (j.hourly?.time ?? []).map((t: number, i: number) => ({
      time: t * 1000,
      temperature: num(j.hourly.temperature_2m[i]),
      rainChance: num(j.hourly.precipitation_probability[i]),
      rain: num(j.hourly.precipitation[i]),
      code: num(j.hourly.weather_code[i]),
      gusts: num(j.hourly.wind_gusts_10m[i]),
      uv: num(j.hourly.uv_index[i]),
      isDay: j.hourly.is_day[i] === 1,
    })),
    daily: (j.daily?.time ?? []).map((t: number, i: number) => ({
      time: t * 1000,
      code: num(j.daily.weather_code[i]),
      max: num(j.daily.temperature_2m_max[i]),
      min: num(j.daily.temperature_2m_min[i]),
      rain: num(j.daily.precipitation_sum[i]),
      rainChance: num(j.daily.precipitation_probability_max[i]),
    })),
  };
}

/** Find a town or postcode. Place names come back in the given language. */
export async function searchPlaces(query: string, language: string): Promise<GardenLocation[]> {
  const params = new URLSearchParams({ name: query, count: "6", language, format: "json" });
  const response = await fetch(`${GEOCODING_URL}?${params}`);
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  const j = await response.json();
  return (j.results ?? []).map((r: Record<string, unknown>) => ({
    name: String(r.name ?? ""),
    admin1: typeof r.admin1 === "string" ? r.admin1 : undefined,
    country: typeof r.country === "string" ? r.country : undefined,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
  }));
}

// ---------------------------------------------------------------------------
// Weather codes (WMO) -> a simple kind with its own text and icon
// ---------------------------------------------------------------------------

export type WeatherKind =
  | "clear"
  | "mostlyClear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "freezingRain"
  | "rain"
  | "showers"
  | "snow"
  | "thunderstorm"
  | "hail";

const THUNDERSTORM = [95];
const HAIL = [96, 99]; // thunderstorm with hail
const SNOW = [71, 73, 75, 77, 85, 86];

export function weatherKind(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code === 1) return "mostlyClear";
  if (code === 2) return "partlyCloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "freezingRain";
  if (code >= 61 && code <= 65) return "rain";
  if (code >= 80 && code <= 82) return "showers";
  if (SNOW.includes(code)) return "snow";
  if (THUNDERSTORM.includes(code)) return "thunderstorm";
  if (HAIL.includes(code)) return "hail";
  return "overcast";
}

// ---------------------------------------------------------------------------
// Tips for the plant - looks at the next 24 hours
// ---------------------------------------------------------------------------

export type AdviceId =
  | "hail"
  | "storm"
  | "snow"
  | "wind"
  | "frost"
  | "cold"
  | "heat"
  | "rainDry"
  | "heavyRain"
  | "rainSkip"
  | "strongSun"
  | "allGood"
  | "inside"
  | "goodDayOutside";

export interface WeatherAdvice {
  id: AdviceId;
  severity: "critical" | "warning" | "info";
  /** when it happens (ms) */
  at: number;
  /** e.g. gusts in km/h, temperature in °C, rain in mm, UV index */
  value?: number;
  /** the plant's limit it's compared with (e.g. min temperature) */
  limit?: number;
}

/** Limits used by the tips. Plant-specific values come from the AI care plan. */
export const WEATHER_LIMITS = {
  gustsWarning: 50, // km/h - pots can fall over
  gustsCritical: 75, // km/h - storm
  heavyRain: 15, // mm in 24 h
  someRain: 2, // mm in 24 h - enough to skip watering
  rainForDryPlant: 5, // mm in 24 h - too much for plants that like dry soil
  dryPlantMoistureMax: 40, // % - plants whose soil range ends below this "like it dry" (e.g. cactus)
  shadePlantLightMax: 90, // % - plants whose light range ends below this don't want full midday sun
  strongUv: 7,
  defaultMinTemp: 5, // °C when no plant is set
  defaultMaxTemp: 30,
} as const;

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

function extreme<T>(list: T[], better: (a: T, b: T) => boolean): T {
  return list.reduce((best, item) => (better(item, best) ? item : best));
}

/**
 * Turns the forecast into tips for the plant, e.g. "Thunderstorm today at 16:00 – bring the plant inside".
 * Outdoors: warnings about storms, wind, frost, heat, rain and strong sun (using the plant's own ranges).
 * Inside: says whether it's a nice day to put the plant outside.
 */
export function weatherAdvice(
  forecast: Forecast,
  plant: PlantProfile | null,
  outdoors: boolean,
  now: number,
): WeatherAdvice[] {
  const hourStart = now - (now % 3_600_000);
  const next = forecast.hourly.filter((h) => h.time >= hourStart && h.time < now + 24 * 3_600_000);
  if (next.length === 0) return [];

  const L = WEATHER_LIMITS;
  const minTemp = plant?.ranges.temperature.min ?? L.defaultMinTemp;
  const maxTemp = plant?.ranges.temperature.max ?? L.defaultMaxTemp;
  const likesDry = plant !== null && plant.ranges.moisture.max <= L.dryPlantMoistureMax;
  const shadePlant = plant !== null && plant.ranges.light.max < L.shadePlantLightMax;

  const hail = next.find((h) => HAIL.includes(h.code));
  const storm = next.find((h) => THUNDERSTORM.includes(h.code));
  const snow = next.find((h) => SNOW.includes(h.code));
  const windiest = extreme(next, (a, b) => a.gusts > b.gusts);
  const coldest = extreme(next, (a, b) => a.temperature < b.temperature);
  const hottest = extreme(next, (a, b) => a.temperature > b.temperature);
  const sunniest = extreme(next, (a, b) => a.uv > b.uv);
  const rainTotal = Math.round(next.reduce((sum, h) => sum + h.rain, 0) * 10) / 10;
  const firstRain = next.find((h) => h.rain >= 0.5) ?? next.find((h) => h.rain > 0);

  const advice: WeatherAdvice[] = [];

  if (outdoors) {
    if (hail) advice.push({ id: "hail", severity: "critical", at: hail.time });
    else if (storm) advice.push({ id: "storm", severity: "critical", at: storm.time });
    if (snow) advice.push({ id: "snow", severity: "critical", at: snow.time });

    if (windiest.gusts >= L.gustsWarning) {
      const severity = windiest.gusts >= L.gustsCritical ? "critical" : "warning";
      const firstStrong = next.find((h) => h.gusts >= L.gustsWarning) ?? windiest;
      advice.push({ id: "wind", severity, at: firstStrong.time, value: Math.round(windiest.gusts) });
    }

    // Compared as whole degrees, like they are shown (17.9 °C vs. "at least 18 °C" is not worth a warning)
    const low = Math.round(coldest.temperature);
    const high = Math.round(hottest.temperature);
    if (low <= 0) {
      advice.push({ id: "frost", severity: "critical", at: coldest.time, value: low });
    } else if (low < minTemp) {
      advice.push({ id: "cold", severity: "warning", at: coldest.time, value: low, limit: minTemp });
    }
    if (high > maxTemp) {
      advice.push({ id: "heat", severity: "warning", at: hottest.time, value: high, limit: maxTemp });
    }

    if (firstRain && rainTotal >= L.someRain) {
      if (likesDry && rainTotal >= L.rainForDryPlant) {
        advice.push({ id: "rainDry", severity: "warning", at: firstRain.time, value: rainTotal });
      } else if (rainTotal >= L.heavyRain) {
        advice.push({ id: "heavyRain", severity: "warning", at: firstRain.time, value: rainTotal });
      } else if (!likesDry) {
        advice.push({ id: "rainSkip", severity: "info", at: firstRain.time, value: rainTotal });
      }
    }

    if (shadePlant && sunniest.uv >= L.strongUv) {
      advice.push({ id: "strongSun", severity: "warning", at: sunniest.time, value: Math.round(sunniest.uv) });
    }

    if (!advice.some((a) => a.severity !== "info")) advice.push({ id: "allGood", severity: "info", at: now });
  } else {
    // Inside: is there a nice stretch of daytime weather to put the plant outside?
    const niceHours = next.filter(
      (h) =>
        h.isDay &&
        h.code <= 3 &&
        h.rain === 0 &&
        h.gusts < 40 &&
        h.temperature >= minTemp &&
        h.temperature <= maxTemp,
    );
    const badWeather = hail || storm || snow;
    if (niceHours.length >= 3 && !badWeather) {
      advice.push({ id: "goodDayOutside", severity: "info", at: niceHours[0].time });
    } else {
      advice.push({ id: "inside", severity: "info", at: now });
    }
  }

  return advice.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Short weather summary sent with chat questions, so the assistant can answer "can it stay outside?". */
export interface WeatherSummary {
  place: string;
  outdoors: boolean;
  now: { temperature: number; sky: WeatherKind };
  next24h: { min: number; max: number; rainMm: number; maxGusts: number; thunderstorm: boolean; snow: boolean };
}

export function summarizeForecast(forecast: Forecast, place: string, outdoors: boolean, now: number): WeatherSummary {
  const next = forecast.hourly.filter((h) => h.time >= now - 3_600_000 && h.time < now + 24 * 3_600_000);
  const temps = next.map((h) => h.temperature);
  return {
    place,
    outdoors,
    now: { temperature: forecast.current.temperature, sky: weatherKind(forecast.current.code) },
    next24h: {
      min: Math.round(Math.min(...temps)),
      max: Math.round(Math.max(...temps)),
      rainMm: Math.round(next.reduce((sum, h) => sum + h.rain, 0) * 10) / 10,
      maxGusts: Math.round(Math.max(...next.map((h) => h.gusts))),
      thunderstorm: next.some((h) => THUNDERSTORM.includes(h.code) || HAIL.includes(h.code)),
      snow: next.some((h) => SNOW.includes(h.code)),
    },
  };
}
