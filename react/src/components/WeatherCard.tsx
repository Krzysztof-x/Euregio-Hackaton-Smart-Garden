import {
  CircleCheck,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Droplet,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Moon,
  Search,
  Sun,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import type { GardenSettings } from "../hooks/useSettings";
import { useAdviceText } from "../hooks/useWeather";
import { useI18n } from "../i18n/context";
import type { PlantProfile } from "../plant";
import { searchPlaces, weatherKind, type Forecast, type GardenLocation, type WeatherAdvice, type WeatherKind } from "../weather";

/** Icon for a weather code (day/night aware for clear skies). */
function weatherIcon(code: number, isDay: boolean): LucideIcon {
  const icons: Record<WeatherKind, LucideIcon> = {
    clear: isDay ? Sun : Moon,
    mostlyClear: isDay ? Sun : Moon,
    partlyCloudy: isDay ? CloudSun : CloudMoon,
    overcast: Cloud,
    fog: CloudFog,
    drizzle: CloudDrizzle,
    freezingRain: CloudHail,
    rain: CloudRain,
    showers: CloudSunRain,
    snow: CloudSnow,
    thunderstorm: CloudLightning,
    hail: CloudHail,
  };
  return icons[weatherKind(code)];
}

const ADVICE_ICONS: Record<WeatherAdvice["severity"], LucideIcon> = {
  critical: TriangleAlert,
  warning: TriangleAlert,
  info: CircleCheck,
};

interface WeatherCardProps {
  settings: GardenSettings;
  onChange: (change: Partial<GardenSettings>) => void;
  forecast: Forecast | null;
  error: boolean;
  advice: WeatherAdvice[];
  plant: PlantProfile | null;
  now: number;
}

/** Weather at the garden + tips for the plant (Open-Meteo, free, no API key). */
export function WeatherCard({ settings, onChange, forecast, error, advice, plant, now }: WeatherCardProps) {
  const { t, lang, formatNumber, formatTime } = useI18n();
  const adviceText = useAdviceText();
  const [editing, setEditing] = useState(false);
  const location = settings.location;
  const showSearch = !location || editing;

  const nextHours = forecast ? forecast.hourly.filter((h) => h.time >= now - 3_600_000).slice(0, 12) : [];
  const dayName = (time: number, index: number) =>
    index === 0
      ? t("weatherToday")
      : index === 1
        ? t("weatherTomorrow")
        : new Intl.DateTimeFormat(lang, { weekday: "long" }).format(time);

  const place = location ? [location.name, location.admin1, location.country].filter(Boolean).join(", ") : "";

  return (
    <section className="card weather-card" aria-labelledby="weather-title">
      <header className="card-head">
        <span className="card-icon" style={{ "--c": "var(--series-humidity)" } as CSSProperties}>
          <CloudSun size={18} aria-hidden="true" />
        </span>
        <h2 className="card-title" id="weather-title">
          {t("weatherTitle")}
        </h2>
        {location && !showSearch && <span className="weather-place">{place}</span>}
        {location && !showSearch && (
          <div className="card-meta">
            <div className="segmented" role="group" aria-label={t("weatherPlantIs")}>
              <button type="button" aria-pressed={settings.outdoors} onClick={() => onChange({ outdoors: true })}>
                {t("weatherOutside")}
              </button>
              <button type="button" aria-pressed={!settings.outdoors} onClick={() => onChange({ outdoors: false })}>
                {t("weatherInside")}
              </button>
            </div>
            <button
              type="button"
              className="icon-btn is-quiet"
              onClick={() => setEditing(true)}
              aria-label={t("weatherChangeLocation")}
              title={t("weatherChangeLocation")}
            >
              <MapPin size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      {showSearch && (
        <LocationSearch
          onPick={(picked) => {
            onChange({ location: picked });
            setEditing(false);
          }}
          onCancel={location ? () => setEditing(false) : undefined}
        />
      )}

      {!showSearch && !forecast && (
        <p className="weather-status">
          {error ? (
            <>
              <TriangleAlert size={16} aria-hidden="true" /> {t("weatherError")}
            </>
          ) : (
            <>
              <LoaderCircle size={16} className="spin" aria-hidden="true" /> {t("weatherLoading")}
            </>
          )}
        </p>
      )}

      {!showSearch && forecast && (
        <>
          <div className="weather-main">
            <div className="weather-now">
              {(() => {
                const Icon = weatherIcon(forecast.current.code, forecast.current.isDay);
                return <Icon size={44} strokeWidth={1.5} aria-hidden="true" />;
              })()}
              <div>
                <div className="card-value">
                  <span className="card-value-number">{formatNumber(forecast.current.temperature, 1)}</span>
                  <span className="card-value-unit">°C</span>
                </div>
                <p className="weather-desc">{t(`weather_${weatherKind(forecast.current.code)}`)}</p>
                <p className="weather-meta">
                  <Wind size={14} aria-hidden="true" />
                  {t("weatherWind", { speed: Math.round(forecast.current.wind) })} ·{" "}
                  {t("weatherGusts", { speed: Math.round(forecast.current.gusts) })}
                </p>
              </div>
            </div>

            <div className="weather-tips">
              <h3>{t("weatherTips")}</h3>
              <ul>
                {advice.map((item) => {
                  const { title, body } = adviceText(item, plant, now);
                  const Icon = ADVICE_ICONS[item.severity];
                  return (
                    <li key={item.id} className={`is-${item.severity}`}>
                      <Icon size={18} aria-hidden="true" />
                      <div>
                        <strong>{title}</strong>
                        <p>{body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="weather-hours" aria-label={t("weatherNextHours")}>
            {nextHours.map((hour) => {
              const Icon = weatherIcon(hour.code, hour.isDay);
              return (
                <div key={hour.time} className="weather-hour" title={t(`weather_${weatherKind(hour.code)}`)}>
                  <span className="weather-hour-time">{formatTime(hour.time)}</span>
                  <Icon size={20} aria-hidden="true" />
                  <span className="weather-hour-temp">{Math.round(hour.temperature)}°</span>
                  <span className="weather-hour-rain">
                    {hour.rainChance > 0 && (
                      <>
                        <Droplet size={11} aria-hidden="true" />
                        {hour.rainChance}%
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="weather-days">
            {forecast.daily.map((day, index) => {
              const Icon = weatherIcon(day.code, true);
              return (
                <div key={day.time} className="weather-day">
                  <span className="weather-day-name">{dayName(day.time, index)}</span>
                  <span className="weather-day-icon" title={t(`weather_${weatherKind(day.code)}`)}>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="weather-day-temp">
                    {Math.round(day.max)}° <span>/ {Math.round(day.min)}°</span>
                  </span>
                  <span className="weather-day-rain">
                    <Droplet size={12} aria-hidden="true" />
                    {formatNumber(day.rain, 1)} mm
                  </span>
                </div>
              );
            })}
          </div>

          <p className="plant-note">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              {t("weatherSource")}
            </a>{" "}
            · {t("updated", { time: formatTime(forecast.fetchedAt) })}
          </p>
        </>
      )}
    </section>
  );
}

/** Town search (Open-Meteo geocoding) + "use my location". */
function LocationSearch({ onPick, onCancel }: { onPick: (location: GardenLocation) => void; onCancel?: () => void }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GardenLocation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator && window.isSecureContext;

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      setResults(await searchPlaces(query.trim(), lang));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function locateMe() {
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        onPick({
          name: t("weatherMyLocation"),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
      { timeout: 10_000 },
    );
  }

  return (
    <div className="plant-setup">
      <p className="plant-intro">{t("weatherSetup")}</p>
      <form className="plant-form" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("weatherSearchPlaceholder")}
          aria-label={t("weatherSearchPlaceholder")}
          maxLength={80}
          autoFocus={Boolean(onCancel)}
        />
        <button type="submit" className="btn is-primary" disabled={!query.trim() || busy}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          {t("weatherSearch")}
        </button>
        {canLocate && (
          <button type="button" className="btn" onClick={locateMe} disabled={busy}>
            <LocateFixed size={16} aria-hidden="true" />
            {t("weatherUseLocation")}
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            {t("cancel")}
          </button>
        )}
      </form>

      {failed && (
        <p className="chat-notice" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {t("weatherError")}
        </p>
      )}
      {results && results.length === 0 && <p className="plant-status">{t("weatherNoResults")}</p>}
      {results && results.length > 0 && (
        <div className="chips">
          {results.map((result) => (
            <button key={`${result.latitude},${result.longitude}`} type="button" onClick={() => onPick(result)}>
              <MapPin size={13} aria-hidden="true" /> {[result.name, result.admin1, result.country].filter(Boolean).join(", ")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
