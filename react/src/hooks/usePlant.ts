import { useCallback, useEffect, useState } from "react";
import { toAiError, type AiError, type AiUsage } from "../aiErrors";
import type { PlantProfile } from "../plant";

interface PlantResponse {
  plant?: PlantProfile | null;
  error?: string;
  retryAfter?: number;
  usage?: AiUsage;
}

const REFRESH_MS = 60_000; // pick up a plant changed on another device

/** "My plant": loads the care plan from the server and asks the AI for a new one. */
export function usePlant() {
  const [plant, setPlant] = useState<PlantProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/plant");
      const data = (await response.json()) as PlantResponse;
      if (response.ok) setPlant(data.plant ?? null);
      if (data.usage) setUsage(data.usage);
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

  /** Asks the AI for a care plan (free if this plant was asked for before). Returns true on success. */
  async function create(name: string): Promise<boolean> {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/plant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json().catch(() => ({}))) as PlantResponse;
      if (data.usage) setUsage(data.usage);
      if (response.ok && data.plant) {
        setPlant(data.plant);
        return true;
      }
      setError(toAiError(data));
    } catch {
      setError({ code: "generic" });
    } finally {
      setCreating(false);
    }
    return false;
  }

  return { plant, loaded, creating, error, usage, create, clearError: () => setError(null) };
}

export type PlantState = ReturnType<typeof usePlant>;
