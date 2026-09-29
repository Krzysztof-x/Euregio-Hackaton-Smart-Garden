import {
  CircleArrowDown,
  CircleArrowUp,
  CircleCheck,
  Droplets,
  LoaderCircle,
  MessageCircle,
  Moon,
  Pencil,
  Sprout,
  Sun,
  Thermometer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import { aiErrorText } from "../aiErrors";
import { isLightCheckTime } from "../alerts";
import { LIGHT_CHECK_HOURS } from "../config";
import type { PlantState } from "../hooks/usePlant";
import { useI18n } from "../i18n/context";
import { METRIC_DIGITS, METRIC_UNITS, METRICS, rangeStatus, type Metric } from "../plant";

const METRIC_ICONS: Record<Metric, LucideIcon> = {
  moisture: Sprout,
  light: Sun,
  temperature: Thermometer,
  humidity: Droplets,
};

interface PlantCardProps {
  plantState: PlantState;
  /** latest fresh value per sensor (missing = sensor offline) */
  current: Partial<Record<Metric, number>>;
  now: number;
  onAsk: (question: string) => void;
}

/** "My plant": enter the plant once, the AI creates targets; then live feedback per sensor. */
export function PlantCard({ plantState, current, now, onAsk }: PlantCardProps) {
  const i18n = useI18n();
  const { t, lang, formatNumber } = i18n;
  const { plant, loaded, creating, error, usage, create, clearError } = plantState;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const showForm = loaded && (!plant || editing);

  async function submit(plantName: string) {
    if (!plantName.trim() || creating) return;
    setName(plantName);
    if (await create(plantName)) {
      setEditing(false);
      setName("");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(name);
  }

  return (
    <section className="card plant-card" aria-labelledby="plant-title">
      <header className="card-head">
        <span className="card-icon" style={{ "--c": "var(--series-moisture)" } as CSSProperties}>
          <Sprout size={18} aria-hidden="true" />
        </span>
        <h2 className="card-title" id="plant-title">
          {t("plantTitle")}
        </h2>
        {plant && !showForm && (
          <div className="card-meta">
            <button
              type="button"
              className="btn"
              onClick={() => onAsk(t("plantAskQuestion", { plant: plant.name[lang] }))}
              aria-label={t("plantAsk")}
              title={t("plantAsk")}
            >
              <MessageCircle size={16} aria-hidden="true" />
              <span className="btn-label">{t("plantAsk")}</span>
            </button>
            <button
              type="button"
              className="icon-btn is-quiet"
              onClick={() => setEditing(true)}
              aria-label={t("plantChange")}
              title={t("plantChange")}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      {showForm && (
        <div className="plant-setup">
          <p className="plant-intro">{t("plantIntro")}</p>
          <form className="plant-form" onSubmit={handleSubmit}>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearError();
              }}
              placeholder={t("plantPlaceholder")}
              aria-label={t("plantPlaceholder")}
              maxLength={60}
              disabled={creating}
              autoFocus={editing}
            />
            <button type="submit" className="btn is-primary" disabled={!name.trim() || creating}>
              {creating && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
              {t("plantCreate")}
            </button>
            {plant && (
              <button type="button" className="btn" onClick={() => setEditing(false)} disabled={creating}>
                {t("cancel")}
              </button>
            )}
          </form>
          <div className="chips">
            {t("plantExamples")
              .split(", ")
              .map((example) => (
                <button key={example} type="button" onClick={() => void submit(example)} disabled={creating}>
                  {example}
                </button>
              ))}
          </div>
          {creating && <p className="plant-status">{t("plantCreating")}</p>}
          {error && (
            <p className="chat-notice" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              {aiErrorText(error, usage, i18n)}
            </p>
          )}
        </div>
      )}

      {plant && !showForm && (
        <>
          <p className="plant-name">{plant.name[lang]}</p>
          <div className="plant-body">
            <div className="plant-care">
              <div className="plant-fact">
                <Droplets size={18} aria-hidden="true" />
                <div>
                  <strong>{t("plantWatering")}</strong>
                  <p>{plant.watering[lang]}</p>
                </div>
              </div>
              <div className="plant-fact">
                <Sun size={18} aria-hidden="true" />
                <div>
                  <strong>{t("plantSunlight")}</strong>
                  <p>{plant.sunlight[lang]}</p>
                </div>
              </div>
              {plant.tips[lang].length > 0 && (
                <div className="plant-fact">
                  <CircleCheck size={18} aria-hidden="true" />
                  <div>
                    <strong>{t("plantTips")}</strong>
                    <ul>
                      {plant.tips[lang].map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="plant-targets">
              <h3>{t("plantTargets")}</h3>
              <table>
                <tbody>
                  {METRICS.map((metric) => {
                    const Icon = METRIC_ICONS[metric];
                    const range = plant.ranges[metric];
                    const unit = METRIC_UNITS[metric];
                    const value = current[metric];
                    const night = metric === "light" && !isLightCheckTime(now);
                    const status = value === undefined ? null : rangeStatus(value, range);
                    return (
                      <tr key={metric}>
                        <th scope="row">
                          <Icon size={15} aria-hidden="true" />
                          {t(metric)}
                        </th>
                        <td className="plant-now">
                          {value === undefined ? "–" : `${formatNumber(value, METRIC_DIGITS[metric])} ${unit}`}
                        </td>
                        <td className="plant-range">
                          {range.min}–{range.max} {unit}
                        </td>
                        <td>
                          <StatusPill status={status} night={night} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="plant-note">{t("plantNote", { from: LIGHT_CHECK_HOURS.from, to: LIGHT_CHECK_HOURS.to })}</p>
        </>
      )}
    </section>
  );
}

/** "OK" / "Too low" / "Too high" with its own icon shape - never color alone. On phones only the icon shows. */
function StatusPill({ status, night }: { status: "low" | "ok" | "high" | null; night: boolean }) {
  const { t } = useI18n();
  if (status === null) return <span className="status is-none">{t("statusNoData")}</span>;

  const [className, Icon, text] = night
    ? (["is-none", Moon, t("statusNight")] as const)
    : status === "ok"
      ? (["is-ok", CircleCheck, t("statusOk")] as const)
      : status === "low"
        ? (["is-warn", CircleArrowDown, t("statusLow")] as const)
        : (["is-warn", CircleArrowUp, t("statusHigh")] as const);

  return (
    <span className={`status ${className}`} title={text}>
      <Icon size={15} aria-hidden="true" />
      <span className="status-text">{text}</span>
    </span>
  );
}
