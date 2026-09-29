import { Bell, BellOff, BellRing, CircleCheck, CloudLightning, ServerOff, TriangleAlert, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Alert } from "../alerts";
import { useAlertText, type NotificationPermissionState } from "../hooks/useAlerts";
import { useI18n } from "../i18n/context";
import type { PlantProfile } from "../plant";

const ICONS = { range: TriangleAlert, offline: WifiOff, broker: ServerOff, weather: CloudLightning } as const;

interface AlertsButtonProps {
  alerts: Alert[];
  plant: PlantProfile | null;
  permission: NotificationPermissionState;
  onEnable: () => void;
}

/** Bell in the header: number of problems + a panel listing them. */
export function AlertsButton({ alerts, plant, permission, onEnable }: AlertsButtonProps) {
  const { t, formatTime } = useI18n();
  const describe = useAlertText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when clicking somewhere else
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const label = t("alertsButton", { count: alerts.length });

  return (
    <div className="alerts" ref={rootRef} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        className={alerts.length > 0 ? "icon-btn has-alerts" : "icon-btn"}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {alerts.length > 0 ? <BellRing size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
        {alerts.length > 0 && <span className="alerts-count">{alerts.length}</span>}
      </button>

      {open && (
        <div className="alerts-panel" role="dialog" aria-label={t("alertsTitle")}>
          <h2>{t("alertsTitle")}</h2>

          {alerts.length === 0 ? (
            <p className="alerts-empty">
              <CircleCheck size={16} aria-hidden="true" />
              {t("alertsNone")}
            </p>
          ) : (
            <ul className="alerts-list">
              {alerts.map((alert) => {
                const { title, body } = describe(alert, plant);
                const Icon = ICONS[alert.kind];
                return (
                  <li key={alert.id} className={`is-${alert.kind}`}>
                    <Icon size={18} aria-hidden="true" />
                    <div>
                      <strong>{title}</strong>
                      <p>{body}</p>
                      {alert.kind === "range" && <small>{t("alertsSince", { time: formatTime(alert.since) })}</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!plant && <p className="alerts-hint">{t("alertsNoPlant")}</p>}

          <div className="alerts-footer">
            {permission === "default" && (
              <button type="button" className="btn" onClick={onEnable}>
                <BellRing size={16} aria-hidden="true" />
                {t("alertsEnable")}
              </button>
            )}
            {permission === "granted" && <p>{t("alertsEnabled")}</p>}
            {permission === "denied" && (
              <p>
                <BellOff size={14} aria-hidden="true" /> {t("alertsBlocked")}
              </p>
            )}
            {permission === "unsupported" && <p>{t("alertsUnsupported")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
