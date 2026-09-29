import { useEffect, useState } from "react";
import { useI18n } from "../i18n/context";
import type { PlantProfile } from "../plant";
import { fetchForecast, type Forecast, type GardenLocation, type WeatherAdvice } from "../weather";

const REFRESH_MS = 15 * 60_000; // Open-Meteo updates its models every hour - 15 min is plenty

/** Loads the forecast for the garden and refreshes it every 15 minutes. */
export function useWeather(location: GardenLocation | null) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState(false);
  const lat = location?.latitude;
  const lon = location?.longitude;

  useEffect(() => {
    setForecast(null);
    setError(false);
    if (!location) return;

    const controller = new AbortController();
    const load = () =>
      fetchForecast(location, controller.signal)
        .then((data) => {
          setForecast(data);
          setError(false);
        })
        .catch((problem: Error) => {
          if (problem.name !== "AbortError") setError(true); // keep showing the last forecast, if any
        });

    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(id);
    };
    // only reload when the place really changes (not when the location object is re-created)
  }, [lat, lon]);

  return { forecast, error };
}

/** "today at 16:00" / "tomorrow at 03:00" / "Thursday at 09:00" */
export function useWhenText() {
  const { t, lang, formatTime } = useI18n();
  return (at: number, now: number) => {
    if (at <= now) return t("whenNow");
    const day = new Date(at);
    const today = new Date(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const time = formatTime(at);
    if (sameDay(day, today)) return t("whenToday", { time });
    if (sameDay(day, tomorrow)) return t("whenTomorrow", { time });
    const weekday = new Intl.DateTimeFormat(lang, { weekday: "long" }).format(day);
    return t("whenOn", { day: weekday, time });
  };
}

/** Title + text of a weather tip, e.g. "Thunderstorm today at 16:00" / "Bring Cactus inside." */
export function useAdviceText() {
  const { t, lang, formatNumber } = useI18n();
  const when = useWhenText();
  return (advice: WeatherAdvice, plant: PlantProfile | null, now: number) => {
    const vars = {
      when: when(advice.at, now),
      plant: plant?.name[lang] ?? t("thePlant"),
      value: advice.value === undefined ? "" : formatNumber(advice.value, advice.id.startsWith("rain") || advice.id === "heavyRain" ? 1 : 0),
      limit: advice.limit ?? "",
    };
    const title = t(`advice_${advice.id}_title`, vars);
    const body = t(`advice_${advice.id}_body`, vars);
    // "the plant would enjoy…" -> "The plant would enjoy…"
    return { title, body: body.charAt(0).toUpperCase() + body.slice(1) };
  };
}
