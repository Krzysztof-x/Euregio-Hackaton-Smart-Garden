import { Droplets, Sprout, Sun, Thermometer } from "lucide-react";
import { useMemo, useState } from "react";
import { findAlerts, weatherAlerts } from "./alerts";
import { niceScale, PERCENT_SCALE } from "./chartScale";
import { AlertsButton } from "./components/AlertsButton";
import { isStale } from "./components/Card";
import { ChatPanel, type ChatRequest } from "./components/ChatPanel";
import { DeviceList } from "./components/DeviceList";
import { Header } from "./components/Header";
import { MetricCard } from "./components/MetricCard";
import { PlantCard } from "./components/PlantCard";
import { Toasts } from "./components/Toasts";
import { WeatherCard } from "./components/WeatherCard";
import { AnalogDetails, MoistureBadge } from "./components/SensorDetails";
import { MOISTURE_DRY_BELOW, MOISTURE_WET_ABOVE } from "./config";
import { useAlertNotifications } from "./hooks/useAlerts";
import type { SensorSnapshot } from "./hooks/useChat";
import { useGardenData, type Point } from "./hooks/useGardenData";
import { useNow } from "./hooks/useNow";
import { usePlant } from "./hooks/usePlant";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useWeather } from "./hooks/useWeather";
import { useI18n } from "./i18n/context";
import type { Metric } from "./plant";
import { summarizeForecast, weatherAdvice } from "./weather";

/** Time of the newest reading in any of the lists, or null if all are empty. */
function latestTime(...lists: { t: number }[][]): number | null {
  const times = lists.map((list) => list.at(-1)?.t ?? -Infinity);
  const newest = Math.max(...times);
  return Number.isFinite(newest) ? newest : null;
}

const DEFAULT_MOISTURE_RANGE = { min: MOISTURE_DRY_BELOW, max: MOISTURE_WET_ABOVE };

export default function App() {
  const { t, lang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { data, status, statusSince } = useGardenData();
  const plantState = usePlant();
  const plant = plantState.plant;
  const now = useNow();
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
  const { settings, update: updateSettings } = useSettings();
  const { forecast, error: weatherError } = useWeather(settings.location);

  // Weather tips for the plant (thunderstorm, frost, rain, …) - plain rules, no AI
  const advice = useMemo(
    () => (forecast ? weatherAdvice(forecast, plant, settings.outdoors, now) : []),
    [forecast, plant, settings.outdoors, now],
  );

  // Problems (plant values out of range, sensors not sending, broker down) -> bell, toasts, pop-ups
  const alerts = useMemo(
    () => [...findAlerts(data, plant, status, statusSince, now), ...weatherAlerts(advice, settings.outdoors)],
    [data, plant, status, statusSince, now, advice, settings.outdoors],
  );
  const notifications = useAlertNotifications(alerts, plant, plantState.loaded, now);

  // Latest values that are still fresh - for the plant card and the chat
  const fresh = (list: Point[]) => {
    const last = list.at(-1);
    return last && !isStale(last.t, now) ? last.v : undefined;
  };
  const sensors: SensorSnapshot = {
    temperature: fresh(data.temperature),
    humidity: fresh(data.humidity),
    moisture: fresh(data.moisture),
    light: fresh(data.light),
  };

  // The plant's ideal range is shown as a shaded band in each chart
  const band = (metric: Metric) =>
    plant ? { from: plant.ranges[metric].min, to: plant.ranges[metric].max, label: plant.name[lang] } : undefined;
  const moistureRange = plant?.ranges.moisture ?? DEFAULT_MOISTURE_RANGE;

  // Temperature axis follows the values (and the plant's range, so the band is always visible)
  const temperatureScale = useMemo(() => {
    const values = data.temperature.map((p) => p.v);
    if (plant) values.push(plant.ranges.temperature.min, plant.ranges.temperature.max);
    return niceScale(values, 4);
  }, [data.temperature, plant]);

  const lastMoisture = data.moisture.at(-1);
  const lastLight = data.light.at(-1);

  return (
    <div className="app">
      <Header status={status} theme={theme} onToggleTheme={toggleTheme}>
        <AlertsButton
          alerts={alerts}
          plant={plant}
          permission={notifications.permission}
          onEnable={() => void notifications.enable()}
        />
      </Header>

      <PlantCard
        plantState={plantState}
        current={sensors}
        now={now}
        onAsk={(question) => setChatRequest({ id: Date.now(), question })}
      />

      <WeatherCard
        settings={settings}
        onChange={(change) => void updateSettings(change)}
        forecast={forecast}
        error={weatherError}
        advice={advice}
        plant={plant}
        now={now}
      />

      <main className="grid">
        <MetricCard
          title={t("temperature")}
          icon={Thermometer}
          color="var(--series-temperature)"
          unit="°C"
          digits={1}
          points={data.temperature}
          now={now}
          scale={temperatureScale}
          band={band("temperature")}
        />
        <MetricCard
          title={t("humidity")}
          icon={Droplets}
          color="var(--series-humidity)"
          unit="%"
          digits={0}
          points={data.humidity}
          now={now}
          scale={PERCENT_SCALE}
          band={band("humidity")}
        />
        <MetricCard
          title={t("moisture")}
          icon={Sprout}
          color="var(--series-moisture)"
          unit="%"
          digits={1}
          points={data.moisture}
          now={now}
          scale={PERCENT_SCALE}
          band={band("moisture") ?? { from: MOISTURE_DRY_BELOW, to: MOISTURE_WET_ABOVE, label: t("goodZone") }}
        >
          {lastMoisture && (
            <>
              <MoistureBadge percent={lastMoisture.v} range={moistureRange} />
              <AnalogDetails point={lastMoisture} />
            </>
          )}
        </MetricCard>
        <MetricCard
          title={t("light")}
          icon={Sun}
          color="var(--series-light)"
          unit="%"
          digits={1}
          points={data.light}
          now={now}
          scale={PERCENT_SCALE}
          band={band("light")}
        >
          {lastLight && <AnalogDetails point={lastLight} />}
        </MetricCard>
      </main>

      <DeviceList
        status={status}
        piLastSeen={latestTime(data.temperature, data.humidity)}
        espLastSeen={latestTime(data.moisture, data.light)}
        now={now}
      />

      <ChatPanel
        sensors={sensors}
        weather={
          forecast && settings.location
            ? summarizeForecast(forecast, settings.location.name, settings.outdoors, now)
            : null
        }
        request={chatRequest}
      />
      <Toasts toasts={notifications.toasts} onDismiss={notifications.dismissToast} />
    </div>
  );
}
