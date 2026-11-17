// Naming a place for a personal rule (docs/03 §5 "Named places").
import type { Config, EngineState } from "./types";
import { nearestPlace } from "./features/mobility";

/**
 * The user picks a place for a rule such as "I skip the gym". If a learned place lies within
 * cfg.placeRadiusM it gets the label; otherwise a new place is added with no minutes yet, so
 * future visits are assigned to it. Returns a new state and the place id.
 */
export function pickPlace(state: EngineState, label: string, lat: number, lon: number, cfg: Config): { state: EngineState; placeId: string } {
  const places = state.places.map((p) => ({ ...p }));
  const near = nearestPlace(places, lat, lon, cfg.placeRadiusM);
  if (near) {
    near.label = label;
    return { state: { ...state, places }, placeId: near.id };
  }
  const base = `p_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "place"}`;
  let id = base;
  for (let i = 2; places.some((p) => p.id === id); i++) id = `${base}_${i}`;
  places.push({ id, lat, lon, minutes: 0, label });
  return { state: { ...state, places }, placeId: id };
}
