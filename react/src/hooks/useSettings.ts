import { useCallback, useEffect, useState } from "react";
import type { GardenLocation } from "../weather";

export interface GardenSettings {
  location: GardenLocation | null;
  outdoors: boolean;
}

const REFRESH_MS = 60_000; // pick up changes made on another device

/** Garden settings saved on the server (so every device uses the same location and outside/inside). */
export function useSettings() {
  const [settings, setSettings] = useState<GardenSettings>({ location: null, outdoors: true });
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) return;
      setSettings(((await response.json()) as { settings: GardenSettings }).settings);
      setLoaded(true);
    } catch {
      // server not reachable - try again at the next refresh
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  /** Changes some settings (e.g. { outdoors: false }) - shown right away, then saved on the server. */
  async function update(change: Partial<GardenSettings>) {
    setSettings((prev) => ({ ...prev, ...change }));
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (response.ok) setSettings(((await response.json()) as { settings: GardenSettings }).settings);
    } catch {
      // not saved - the next refresh shows what the server has
    }
  }

  return { settings, loaded, update };
}
