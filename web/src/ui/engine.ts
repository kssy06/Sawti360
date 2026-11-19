import { useEffect, useState } from "react";

export type EngineState = "loading" | "on" | "mock" | "off";

let cached: Promise<EngineState> | null = null;

/** Whether the server's voice engine is configured. Asked once per page load. */
export function useEngineStatus(): EngineState {
  const [state, setState] = useState<EngineState>("loading");
  useEffect(() => {
    cached ??= fetch("/api/tts")
      .then((r) => r.json())
      .then((j: { mock?: boolean; configured?: boolean }) => (j.mock ? "mock" : j.configured ? "on" : "off") as EngineState)
      .catch(() => "off" as EngineState);
    let alive = true;
    void cached.then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export const ENGINE_TEXT: Record<Exclude<EngineState, "loading">, string> = {
  on: "Moteur de voix connecté.",
  mock: "Moteur de voix en mode test : l’audio produit est silencieux.",
  off: "Moteur de voix non configuré sur ce déploiement : les répliques autorisées ne seront pas synthétisées.",
};
