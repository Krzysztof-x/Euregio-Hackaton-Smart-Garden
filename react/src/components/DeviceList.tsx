import { Cpu, Microchip, Server, type LucideIcon } from "lucide-react";
import { MQTT_URL, PI_HOST } from "../config";
import type { ConnectionStatus } from "../hooks/useGardenData";
import { useI18n } from "../i18n/context";
import { isStale } from "./Card";

interface Device {
  icon: LucideIcon;
  name: string;
  detail: string;
  online: boolean;
  /** undefined = don't show a "last seen" line */
  lastSeen?: number | null;
}

/** "192.168.1.207:9001" out of "ws://192.168.1.207:9001" */
function brokerAddress(): string {
  try {
    return new URL(MQTT_URL).host;
  } catch {
    return MQTT_URL;
  }
}

interface DeviceListProps {
  status: ConnectionStatus;
  piLastSeen: number | null;
  espLastSeen: number | null;
  now: number;
}

/** Online / offline state of the Pi, the ESP32 and the broker. */
export function DeviceList({ status, piLastSeen, espLastSeen, now }: DeviceListProps) {
  const { t, formatAgo } = useI18n();
  const seenRecently = (time: number | null) => time !== null && !isStale(time, now);

  const devices: Device[] = [
    {
      icon: Cpu,
      name: "Raspberry Pi",
      detail: `${PI_HOST} · ${t("piSensors")}`,
      online: seenRecently(piLastSeen),
      lastSeen: piLastSeen,
    },
    {
      icon: Microchip,
      name: "ESP32",
      detail: t("espSensors"),
      online: seenRecently(espLastSeen),
      lastSeen: espLastSeen,
    },
    {
      icon: Server,
      name: t("broker"),
      detail: brokerAddress(),
      online: status === "connected",
    },
  ];

  return (
    <section className="devices" aria-labelledby="devices-title">
      <h2 id="devices-title" className="section-title">
        {t("devices")}
      </h2>
      <ul className="device-list">
        {devices.map(({ icon: Icon, name, detail, online, lastSeen }) => (
          <li key={name} className="device">
            <span className="device-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="device-text">
              <strong>{name}</strong>
              <span>{detail}</span>
            </span>
            <span className={online ? "device-status is-online" : "device-status is-offline"}>
              <span className="device-state">
                <span className="dot" aria-hidden="true" />
                {online ? t("online") : t("offline")}
              </span>
              {lastSeen !== undefined && (
                <small>{lastSeen === null ? t("noDataYet") : t("lastSeen", { time: formatAgo(lastSeen, now) })}</small>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
